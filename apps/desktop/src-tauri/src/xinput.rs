use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};

#[cfg(target_os = "windows")]
use std::sync::OnceLock;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RawXInputState {
    pub dpad_up: bool,
    pub dpad_down: bool,
    pub dpad_left: bool,
    pub dpad_right: bool,
    pub south: bool,
    pub east: bool,
    pub west: bool,
    pub north: bool,
    pub left_shoulder: bool,
    pub right_shoulder: bool,
    pub left_trigger: bool,
    pub right_trigger: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopInputBridgePayload {
    pub timestamp_ms: f64,
    pub direction: DirectionPayload,
    pub buttons: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DirectionPayload {
    pub up: bool,
    pub down: bool,
    pub back: bool,
    pub forward: bool,
}

pub fn normalize_raw_xinput_state(timestamp_ms: f64, raw_state: RawXInputState) -> DesktopInputBridgePayload {
    let mut buttons = Vec::new();

    if raw_state.west {
        buttons.push("LP".to_string());
    }
    if raw_state.north {
        buttons.push("MP".to_string());
    }
    if raw_state.left_shoulder {
        buttons.push("HP".to_string());
    }
    if raw_state.left_trigger {
        buttons.push("PP".to_string());
    }
    if raw_state.south {
        buttons.push("LK".to_string());
    }
    if raw_state.east {
        buttons.push("MK".to_string());
    }
    if raw_state.right_shoulder {
        buttons.push("HK".to_string());
    }
    if raw_state.right_trigger {
        buttons.push("KK".to_string());
    }

    DesktopInputBridgePayload {
        timestamp_ms,
        direction: DirectionPayload {
            up: raw_state.dpad_up,
            down: raw_state.dpad_down,
            back: raw_state.dpad_left,
            forward: raw_state.dpad_right,
        },
        buttons,
    }
}

pub fn spawn_xinput_bridge<R: Runtime>(app: AppHandle<R>) {
    std::thread::spawn(move || {
        #[cfg(target_os = "windows")]
        {
            let mut previous_payload: Option<DesktopInputBridgePayload> = None;

            loop {
                if let Some(raw_state) = poll_raw_xinput_state(0) {
                    let payload = normalize_raw_xinput_state(current_timestamp_ms(), raw_state);

                    if previous_payload.as_ref() != Some(&payload) {
                        let _ = app.emit("sf6cm://input-sample", payload.clone());
                        previous_payload = Some(payload);
                    }
                }

                std::thread::sleep(std::time::Duration::from_millis(16));
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = app;
        }
    });
}

#[cfg(target_os = "windows")]
fn current_timestamp_ms() -> f64 {
    let elapsed = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();

    elapsed.as_secs_f64() * 1000.0
}

#[cfg(target_os = "windows")]
fn poll_raw_xinput_state(user_index: u32) -> Option<RawXInputState> {
    let mut state = XInputState::default();
    let xinput_get_state = resolve_xinput_get_state()?;

    unsafe {
        if xinput_get_state(user_index, &mut state as *mut XInputState) != 0 {
            return None;
        }
    }

    let buttons = state.gamepad.buttons;

    Some(RawXInputState {
        dpad_up: buttons & XINPUT_GAMEPAD_DPAD_UP != 0,
        dpad_down: buttons & XINPUT_GAMEPAD_DPAD_DOWN != 0,
        dpad_left: buttons & XINPUT_GAMEPAD_DPAD_LEFT != 0,
        dpad_right: buttons & XINPUT_GAMEPAD_DPAD_RIGHT != 0,
        south: buttons & XINPUT_GAMEPAD_A != 0,
        east: buttons & XINPUT_GAMEPAD_B != 0,
        west: buttons & XINPUT_GAMEPAD_X != 0,
        north: buttons & XINPUT_GAMEPAD_Y != 0,
        left_shoulder: buttons & XINPUT_GAMEPAD_LEFT_SHOULDER != 0,
        right_shoulder: buttons & XINPUT_GAMEPAD_RIGHT_SHOULDER != 0,
        left_trigger: state.gamepad.left_trigger >= 200,
        right_trigger: state.gamepad.right_trigger >= 200,
    })
}

#[cfg(target_os = "windows")]
#[repr(C)]
#[derive(Default)]
struct XInputGamepad {
    buttons: u16,
    left_trigger: u8,
    right_trigger: u8,
    thumb_lx: i16,
    thumb_ly: i16,
    thumb_rx: i16,
    thumb_ry: i16,
}

#[cfg(target_os = "windows")]
#[repr(C)]
#[derive(Default)]
struct XInputState {
    packet_number: u32,
    gamepad: XInputGamepad,
}

#[cfg(target_os = "windows")]
const XINPUT_GAMEPAD_DPAD_UP: u16 = 0x0001;
#[cfg(target_os = "windows")]
const XINPUT_GAMEPAD_DPAD_DOWN: u16 = 0x0002;
#[cfg(target_os = "windows")]
const XINPUT_GAMEPAD_DPAD_LEFT: u16 = 0x0004;
#[cfg(target_os = "windows")]
const XINPUT_GAMEPAD_DPAD_RIGHT: u16 = 0x0008;
#[cfg(target_os = "windows")]
const XINPUT_GAMEPAD_LEFT_SHOULDER: u16 = 0x0100;
#[cfg(target_os = "windows")]
const XINPUT_GAMEPAD_RIGHT_SHOULDER: u16 = 0x0200;
#[cfg(target_os = "windows")]
const XINPUT_GAMEPAD_A: u16 = 0x1000;
#[cfg(target_os = "windows")]
const XINPUT_GAMEPAD_B: u16 = 0x2000;
#[cfg(target_os = "windows")]
const XINPUT_GAMEPAD_X: u16 = 0x4000;
#[cfg(target_os = "windows")]
const XINPUT_GAMEPAD_Y: u16 = 0x8000;

#[cfg(target_os = "windows")]
type XInputGetStateFn = unsafe extern "system" fn(user_index: u32, state: *mut XInputState) -> u32;

#[cfg(target_os = "windows")]
static XINPUT_GET_STATE: OnceLock<Option<XInputGetStateFn>> = OnceLock::new();

#[cfg(target_os = "windows")]
fn resolve_xinput_get_state() -> Option<XInputGetStateFn> {
    XINPUT_GET_STATE
        .get_or_init(|| {
            for dll_name in ["xinput1_4.dll", "xinput1_3.dll", "xinput9_1_0.dll"] {
                let module = unsafe { load_library_wide(dll_name) };
                if module.is_null() {
                    continue;
                }

                let proc = unsafe { get_proc_address(module, b"XInputGetState\0".as_ptr()) };
                if !proc.is_null() {
                    return Some(unsafe { std::mem::transmute::<FarProc, XInputGetStateFn>(proc) });
                }
            }

            None
        })
        .to_owned()
}

#[cfg(target_os = "windows")]
type ModuleHandle = *mut std::ffi::c_void;

#[cfg(target_os = "windows")]
type FarProc = *mut std::ffi::c_void;

#[cfg(target_os = "windows")]
extern "system" {
    fn LoadLibraryW(file_name: *const u16) -> ModuleHandle;
    fn GetProcAddress(module: ModuleHandle, proc_name: *const u8) -> FarProc;
}

#[cfg(target_os = "windows")]
unsafe fn load_library_wide(dll_name: &str) -> ModuleHandle {
    let encoded = dll_name.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
    LoadLibraryW(encoded.as_ptr())
}

#[cfg(target_os = "windows")]
unsafe fn get_proc_address(module: ModuleHandle, proc_name: *const u8) -> FarProc {
    GetProcAddress(module, proc_name)
}

#[cfg(test)]
mod tests {
    use super::{normalize_raw_xinput_state, DirectionPayload, RawXInputState};

    #[test]
    fn converts_raw_xinput_state_into_the_frontend_bridge_payload() {
        let payload = normalize_raw_xinput_state(
            33.4,
            RawXInputState {
                dpad_down: true,
                dpad_right: true,
                west: true,
                right_trigger: true,
                ..RawXInputState::default()
            },
        );

        assert_eq!(
            payload.direction,
            DirectionPayload {
                up: false,
                down: true,
                back: false,
                forward: true,
            }
        );
        assert_eq!(payload.buttons, vec!["LP".to_string(), "KK".to_string()]);
    }

    #[test]
    fn preserves_raw_direction_bits_for_shared_core_normalization() {
        let payload = normalize_raw_xinput_state(
            16.7,
            RawXInputState {
                dpad_up: true,
                dpad_down: true,
                dpad_left: true,
                dpad_right: true,
                ..RawXInputState::default()
            },
        );

        assert_eq!(
            payload.direction,
            DirectionPayload {
                up: true,
                down: true,
                back: true,
                forward: true,
            }
        );
    }
}
