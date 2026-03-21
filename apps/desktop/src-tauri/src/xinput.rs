use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};

#[cfg(target_os = "windows")]
use std::sync::OnceLock;

const ANALOG_DIRECTION_THRESHOLD: i16 = 16_384;
const DESKTOP_UNSUPPORTED_DEVICE_ISSUE: &str = "desktop.unsupported_device";
const MODE_READY: &str = "ready";
const MODE_WARNED_NON_GRADING: &str = "warned_non_grading";

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
    pub thumb_lx: i16,
    pub thumb_ly: i16,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopInputBridgePayload {
    pub source_id: String,
    pub timestamp_ms: f64,
    pub direction: DirectionPayload,
    pub buttons: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopInputStatusPayload {
    pub mode: String,
    pub issues: Vec<String>,
    pub active_source_id: Option<String>,
    pub connected_source_ids: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DirectionPayload {
    pub up: bool,
    pub down: bool,
    pub back: bool,
    pub forward: bool,
}

pub fn source_id_for_user_index(user_index: u32) -> String {
    format!("xinput:{user_index}")
}

pub fn normalize_primary_analog_direction(thumb_lx: i16, thumb_ly: i16) -> DirectionPayload {
    DirectionPayload {
        up: i32::from(thumb_ly) <= -i32::from(ANALOG_DIRECTION_THRESHOLD),
        down: i32::from(thumb_ly) >= i32::from(ANALOG_DIRECTION_THRESHOLD),
        back: i32::from(thumb_lx) <= -i32::from(ANALOG_DIRECTION_THRESHOLD),
        forward: i32::from(thumb_lx) >= i32::from(ANALOG_DIRECTION_THRESHOLD),
    }
}

pub fn merge_direction_payloads(digital: DirectionPayload, analog: DirectionPayload) -> DirectionPayload {
    DirectionPayload {
        up: digital.up || analog.up,
        down: digital.down || analog.down,
        back: digital.back || analog.back,
        forward: digital.forward || analog.forward,
    }
}

pub fn normalize_raw_xinput_state(
    source_id: String,
    timestamp_ms: f64,
    raw_state: RawXInputState,
) -> DesktopInputBridgePayload {
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

    let digital_direction = DirectionPayload {
        up: raw_state.dpad_up,
        down: raw_state.dpad_down,
        back: raw_state.dpad_left,
        forward: raw_state.dpad_right,
    };
    let analog_direction = normalize_primary_analog_direction(raw_state.thumb_lx, raw_state.thumb_ly);

    DesktopInputBridgePayload {
        source_id,
        timestamp_ms,
        direction: merge_direction_payloads(digital_direction, analog_direction),
        buttons,
    }
}

pub fn resolve_active_source_id(
    previous_active_source_id: Option<&str>,
    connected_source_ids: &[String],
    changed_source_ids: &[String],
) -> Option<String> {
    if let Some(last_changed_source_id) = changed_source_ids.last() {
        return Some(last_changed_source_id.clone());
    }

    previous_active_source_id
        .filter(|source_id| connected_source_ids.iter().any(|candidate| candidate == source_id))
        .map(str::to_string)
}

pub fn build_status_payload(
    connected_source_ids: &[String],
    active_source_id: Option<String>,
) -> DesktopInputStatusPayload {
    if connected_source_ids.is_empty() {
        return DesktopInputStatusPayload {
            mode: MODE_WARNED_NON_GRADING.to_string(),
            issues: vec![DESKTOP_UNSUPPORTED_DEVICE_ISSUE.to_string()],
            active_source_id: None,
            connected_source_ids: Vec::new(),
        };
    }

    DesktopInputStatusPayload {
        mode: MODE_READY.to_string(),
        issues: Vec::new(),
        active_source_id,
        connected_source_ids: connected_source_ids.to_vec(),
    }
}

pub fn spawn_xinput_bridge<R: Runtime>(app: AppHandle<R>) {
    std::thread::spawn(move || {
        #[cfg(target_os = "windows")]
        {
            let mut previous_signatures_by_source = std::collections::HashMap::<String, String>::new();
            let mut previous_status: Option<DesktopInputStatusPayload> = None;
            let mut active_source_id: Option<String> = None;

            loop {
                let timestamp_ms = current_timestamp_ms();
                let mut payloads = Vec::new();

                for user_index in 0..=3 {
                    if let Some(raw_state) = poll_raw_xinput_state(user_index) {
                        payloads.push(normalize_raw_xinput_state(
                            source_id_for_user_index(user_index),
                            timestamp_ms,
                            raw_state,
                        ));
                    }
                }

                let connected_source_ids = payloads
                    .iter()
                    .map(|payload| payload.source_id.clone())
                    .collect::<Vec<_>>();
                previous_signatures_by_source
                    .retain(|source_id, _| connected_source_ids.iter().any(|candidate| candidate == source_id));

                let mut changed_payloads = Vec::new();

                for payload in &payloads {
                    let signature = payload_signature(payload);

                    match previous_signatures_by_source.get(&payload.source_id) {
                        None => {
                            previous_signatures_by_source.insert(payload.source_id.clone(), signature);
                            if !is_neutral_payload(payload) {
                                changed_payloads.push(payload.clone());
                            }
                        }
                        Some(previous_signature) if previous_signature != &signature => {
                            previous_signatures_by_source.insert(payload.source_id.clone(), signature);
                            changed_payloads.push(payload.clone());
                        }
                        Some(_) => {}
                    }
                }

                let changed_source_ids = changed_payloads
                    .iter()
                    .map(|payload| payload.source_id.clone())
                    .collect::<Vec<_>>();
                active_source_id = resolve_active_source_id(
                    active_source_id.as_deref(),
                    &connected_source_ids,
                    &changed_source_ids,
                );

                let status = build_status_payload(&connected_source_ids, active_source_id.clone());
                if previous_status.as_ref() != Some(&status) {
                    let _ = app.emit("sf6cm://input-status", status.clone());
                    previous_status = Some(status);
                }

                for payload in changed_payloads {
                    let _ = app.emit("sf6cm://input-sample", payload);
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

fn is_neutral_payload(payload: &DesktopInputBridgePayload) -> bool {
    !payload.direction.up
        && !payload.direction.down
        && !payload.direction.back
        && !payload.direction.forward
        && payload.buttons.is_empty()
}

fn payload_signature(payload: &DesktopInputBridgePayload) -> String {
    format!(
        "{}:{}:{}:{}:{}:{}",
        payload.source_id,
        payload.direction.up,
        payload.direction.down,
        payload.direction.back,
        payload.direction.forward,
        payload.buttons.join(",")
    )
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
        thumb_lx: state.gamepad.thumb_lx,
        thumb_ly: state.gamepad.thumb_ly,
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
    use super::{
        build_status_payload, merge_direction_payloads, normalize_primary_analog_direction, normalize_raw_xinput_state,
        resolve_active_source_id, source_id_for_user_index, DesktopInputStatusPayload, DirectionPayload, RawXInputState,
    };

    #[test]
    fn converts_raw_xinput_state_into_the_frontend_bridge_payload() {
        let payload = normalize_raw_xinput_state(
            source_id_for_user_index(1),
            33.4,
            RawXInputState {
                dpad_down: true,
                west: true,
                right_trigger: true,
                thumb_lx: 20_000,
                ..RawXInputState::default()
            },
        );

        assert_eq!(payload.source_id, "xinput:1".to_string());
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
    fn preserves_merged_direction_bits_for_shared_core_neutralization() {
        let direction = merge_direction_payloads(
            DirectionPayload {
                up: true,
                down: true,
                back: false,
                forward: false,
            },
            DirectionPayload {
                up: false,
                down: false,
                back: true,
                forward: true,
            },
        );

        assert_eq!(
            direction,
            DirectionPayload {
                up: true,
                down: true,
                back: true,
                forward: true,
            }
        );
    }

    #[test]
    fn normalizes_primary_analog_direction_with_the_shared_half_axis_threshold() {
        assert_eq!(
            normalize_primary_analog_direction(-16_384, 16_384),
            DirectionPayload {
                up: false,
                down: true,
                back: true,
                forward: false,
            }
        );
        assert_eq!(
            normalize_primary_analog_direction(-16_383, 16_383),
            DirectionPayload::default()
        );
    }

    #[test]
    fn selects_the_last_changed_supported_source_across_xinput_slots() {
        let connected = vec!["xinput:0".to_string(), "xinput:1".to_string()];

        assert_eq!(
            resolve_active_source_id(None, &connected, &["xinput:0".to_string()]),
            Some("xinput:0".to_string())
        );
        assert_eq!(
            resolve_active_source_id(Some("xinput:0"), &connected, &["xinput:1".to_string()]),
            Some("xinput:1".to_string())
        );
    }

    #[test]
    fn clears_the_backend_active_source_when_the_previous_slot_disconnects() {
        let connected = vec!["xinput:0".to_string()];

        assert_eq!(
            resolve_active_source_id(Some("xinput:1"), &connected, &[]),
            None
        );
    }

    #[test]
    fn emits_warned_non_grading_when_no_supported_xinput_device_is_connected() {
        assert_eq!(
            build_status_payload(&[], None),
            DesktopInputStatusPayload {
                mode: "warned_non_grading".to_string(),
                issues: vec!["desktop.unsupported_device".to_string()],
                active_source_id: None,
                connected_source_ids: Vec::new(),
            }
        );
    }
}
