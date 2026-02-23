mod platform;

use serde::{Deserialize, Serialize};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, State};

const BUTTON_ORDER: [&str; 8] = ["LP", "MP", "HP", "LK", "MK", "HK", "DI", "PARry"];
const FRAME_DURATION: Duration = Duration::from_nanos(16_666_667);

pub(crate) const BUTTON_LP_MASK: u16 = 1 << 0;
pub(crate) const BUTTON_MP_MASK: u16 = 1 << 1;
pub(crate) const BUTTON_HP_MASK: u16 = 1 << 2;
pub(crate) const BUTTON_LK_MASK: u16 = 1 << 3;
pub(crate) const BUTTON_MK_MASK: u16 = 1 << 4;
pub(crate) const BUTTON_HK_MASK: u16 = 1 << 5;
pub(crate) const BUTTON_DI_MASK: u16 = 1 << 6;
pub(crate) const BUTTON_PARRY_MASK: u16 = 1 << 7;

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NativeInputMode {
    XInput,
    Hid,
}

#[derive(Clone, Serialize)]
pub struct NativeInputDetectResult {
    xinput: bool,
    hid: bool,
}

impl NativeInputDetectResult {
    pub(crate) const fn new(xinput: bool, hid: bool) -> Self {
        Self { xinput, hid }
    }
}

#[derive(Clone, Copy, Default)]
pub(crate) struct InputSample {
    pub timestamp_ms: u64,
    pub direction: u8,
    pub down_mask: u16,
}

impl InputSample {
    pub(crate) fn neutral(timestamp_ms: u64) -> Self {
        Self {
            timestamp_ms,
            direction: 5,
            down_mask: 0,
        }
    }
}

#[derive(Clone, Serialize)]
struct InputFramePayload {
    frame: u64,
    timestamp_ms: u64,
    direction: u8,
    down: Vec<String>,
}

fn mask_to_buttons(mask: u16) -> Vec<String> {
    BUTTON_ORDER
        .iter()
        .enumerate()
        .filter_map(|(index, name)| {
            let bit = 1u16 << index;
            if mask & bit == bit {
                Some((*name).to_string())
            } else {
                None
            }
        })
        .collect()
}

struct InputWorker {
    stop_flag: Arc<AtomicBool>,
    join_handle: Option<JoinHandle<()>>,
}

impl InputWorker {
    fn start(app: AppHandle, mode: NativeInputMode) -> Result<Self, String> {
        let stop_flag = Arc::new(AtomicBool::new(false));
        let thread_stop_flag = Arc::clone(&stop_flag);

        let join_handle = thread::Builder::new()
            .name("native-input-poller".to_string())
            .spawn(move || {
                let mut source = match platform::InputSource::new(mode) {
                    Ok(source) => source,
                    Err(message) => {
                        let _ = app.emit("input/error", message);
                        return;
                    }
                };

                let mut frame_index: u64 = 0;

                while !thread_stop_flag.load(Ordering::Relaxed) {
                    let tick_start = Instant::now();
                    let sample = source.poll();

                    let payload = InputFramePayload {
                        frame: frame_index,
                        timestamp_ms: sample.timestamp_ms,
                        direction: sample.direction,
                        down: mask_to_buttons(sample.down_mask),
                    };

                    let _ = app.emit("input/frame", payload);
                    frame_index = frame_index.saturating_add(1);

                    let elapsed = tick_start.elapsed();
                    if elapsed < FRAME_DURATION {
                        thread::sleep(FRAME_DURATION - elapsed);
                    }
                }
            })
            .map_err(|error| format!("Failed to start native input polling thread: {error}"))?;

        Ok(Self {
            stop_flag,
            join_handle: Some(join_handle),
        })
    }

    fn stop(mut self) {
        self.stop_flag.store(true, Ordering::Relaxed);
        if let Some(join_handle) = self.join_handle.take() {
            let _ = join_handle.join();
        }
    }
}

#[derive(Default)]
pub struct InputRuntimeState {
    worker: Mutex<Option<InputWorker>>,
}

#[tauri::command]
pub fn input_detect() -> NativeInputDetectResult {
    platform::input_detect()
}

#[tauri::command]
pub fn input_start(
    app: AppHandle,
    state: State<'_, InputRuntimeState>,
    mode: NativeInputMode,
) -> Result<(), String> {
    let detect = platform::input_detect();
    match mode {
        NativeInputMode::XInput if !detect.xinput => {
            return Err("Native input mode 'xinput' did not detect a connected controller.".to_string())
        }
        NativeInputMode::Hid if !detect.hid => {
            return Err("Native input mode 'hid' did not detect a supported PS4 HID controller.".to_string())
        }
        _ => {}
    }

    let mut worker_guard = state
        .worker
        .lock()
        .map_err(|_| "Failed to lock input runtime state.".to_string())?;

    if worker_guard.is_some() {
        return Ok(());
    }

    let worker = InputWorker::start(app, mode)?;
    *worker_guard = Some(worker);
    Ok(())
}

#[tauri::command]
pub fn input_stop(state: State<'_, InputRuntimeState>) -> Result<(), String> {
    let mut worker_guard = state
        .worker
        .lock()
        .map_err(|_| "Failed to lock input runtime state.".to_string())?;

    if let Some(worker) = worker_guard.take() {
        worker.stop();
    }

    Ok(())
}
