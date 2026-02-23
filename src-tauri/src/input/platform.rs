#[cfg(not(windows))]
mod imp {
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::super::{InputSample, NativeInputDetectResult, NativeInputMode};

    pub struct InputSource;

    impl InputSource {
        pub fn new(_mode: NativeInputMode) -> Result<Self, String> {
            Err("Native input is available only on Windows native builds.".to_string())
        }

        pub fn poll(&mut self) -> InputSample {
            InputSample::neutral(now_ms())
        }
    }

    pub fn input_detect() -> NativeInputDetectResult {
        NativeInputDetectResult::new(false, false)
    }

    fn now_ms() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis() as u64)
            .unwrap_or(0)
    }
}

#[cfg(windows)]
mod imp {
    use std::time::{SystemTime, UNIX_EPOCH};

    use hidapi::{DeviceInfo, HidApi, HidDevice};
    use windows_sys::Win32::UI::Input::XboxController::{
        XInputGetState, XINPUT_GAMEPAD_A, XINPUT_GAMEPAD_B, XINPUT_GAMEPAD_BACK,
        XINPUT_GAMEPAD_DPAD_DOWN, XINPUT_GAMEPAD_DPAD_LEFT, XINPUT_GAMEPAD_DPAD_RIGHT,
        XINPUT_GAMEPAD_DPAD_UP, XINPUT_GAMEPAD_LEFT_SHOULDER, XINPUT_GAMEPAD_LEFT_THUMB,
        XINPUT_GAMEPAD_RIGHT_SHOULDER, XINPUT_GAMEPAD_RIGHT_THUMB, XINPUT_GAMEPAD_START,
        XINPUT_GAMEPAD_X, XINPUT_GAMEPAD_Y, XINPUT_STATE, XUSER_MAX_COUNT,
    };

    use super::super::{
        InputSample, NativeInputDetectResult, NativeInputMode, BUTTON_DPAD_DOWN_MASK,
        BUTTON_DPAD_LEFT_MASK, BUTTON_DPAD_RIGHT_MASK, BUTTON_DPAD_UP_MASK, BUTTON_EAST_MASK,
        BUTTON_L1_MASK, BUTTON_L2_MASK, BUTTON_L3_MASK, BUTTON_NORTH_MASK, BUTTON_R1_MASK,
        BUTTON_R2_MASK, BUTTON_R3_MASK, BUTTON_SELECT_MASK, BUTTON_SOUTH_MASK,
        BUTTON_START_MASK, BUTTON_WEST_MASK,
    };

    const ERROR_DEVICE_NOT_CONNECTED: u32 = 1167;
    const XINPUT_TRIGGER_THRESHOLD: u8 = 140;
    const XINPUT_AXIS_DEADZONE: i16 = 16384;

    const TRIGGER_BYTE_THRESHOLD: u8 = 141;
    const ANALOG_CENTER: i32 = 127;
    const ANALOG_AXIS_DEADZONE: i32 = 58;

    pub struct InputSource {
        backend: NativeBackend,
    }

    enum NativeBackend {
        XInput(XInputPrimarySource),
        Hid(Ps4HidNativeSource),
    }

    struct XInputPrimarySource {
        preferred_user_index: u32,
    }

    struct Ps4HidNativeSource {
        device: HidDevice,
        direction: u8,
        down_mask: u16,
    }

    impl InputSource {
        pub fn new(mode: NativeInputMode) -> Result<Self, String> {
            let backend = match mode {
                NativeInputMode::XInput => NativeBackend::XInput(XInputPrimarySource::new()),
                NativeInputMode::Hid => {
                    let source = Ps4HidNativeSource::new().map_err(|error| {
                        format!(
                            "Native input mode 'hid' could not open a supported PS4 HID device: {error}"
                        )
                    })?;
                    NativeBackend::Hid(source)
                }
            };

            Ok(Self { backend })
        }

        pub fn poll(&mut self) -> InputSample {
            match &mut self.backend {
                NativeBackend::XInput(source) => source.poll().unwrap_or_else(|_| InputSample::neutral(now_ms())),
                NativeBackend::Hid(source) => source.poll().unwrap_or_else(|_| InputSample::neutral(now_ms())),
            }
        }
    }

    impl XInputPrimarySource {
        fn new() -> Self {
            Self {
                preferred_user_index: 0,
            }
        }

        fn poll(&mut self) -> Result<InputSample, String> {
            let mut visited = [false; XUSER_MAX_COUNT as usize];
            let order = [self.preferred_user_index, 0, 1, 2, 3];

            for user_index in order {
                if user_index >= XUSER_MAX_COUNT {
                    continue;
                }

                let slot = user_index as usize;
                if visited[slot] {
                    continue;
                }
                visited[slot] = true;

                let mut state = XINPUT_STATE::default();
                let ret = unsafe { XInputGetState(user_index, &mut state) };

                if ret == 0 {
                    self.preferred_user_index = user_index;
                    return Ok(sample_from_xinput_state(&state));
                }

                if ret == ERROR_DEVICE_NOT_CONNECTED {
                    continue;
                }

                return Err(format!(
                    "XInputGetState failed user={} ret={} (0x{:08X})",
                    user_index, ret, ret
                ));
            }

            Ok(InputSample::neutral(now_ms()))
        }
    }

    impl Ps4HidNativeSource {
        fn new() -> Result<Self, String> {
            let api = HidApi::new().map_err(|error| format!("hidapi init error: {error}"))?;

            for device_info in api.device_list() {
                if !is_ps4_hid_candidate(device_info) {
                    continue;
                }

                if let Ok(device) = device_info.open_device(&api) {
                    let _ = device.set_blocking_mode(false);
                    return Ok(Self {
                        device,
                        direction: 5,
                        down_mask: 0,
                    });
                }
            }

            Err("No supported PS4 HID candidate found.".to_string())
        }

        fn poll(&mut self) -> Result<InputSample, String> {
            let mut report = [0u8; 64];
            let read_size = self
                .device
                .read_timeout(&mut report, 0)
                .map_err(|error| format!("hidapi read error: {error}"))?;

            if read_size > 0 {
                if let Some((direction, down_mask)) = decode_gp2040_ps4_report(&report[..read_size]) {
                    self.direction = direction;
                    self.down_mask = down_mask;
                }
            }

            Ok(InputSample {
                timestamp_ms: now_ms(),
                direction: self.direction,
                down_mask: self.down_mask,
            })
        }
    }

    pub fn input_detect() -> NativeInputDetectResult {
        NativeInputDetectResult::new(detect_xinput_controller(), detect_ps4_hid_controller())
    }

    fn detect_xinput_controller() -> bool {
        let mut state = XINPUT_STATE::default();
        (0..XUSER_MAX_COUNT).any(|user_index| unsafe { XInputGetState(user_index, &mut state) == 0 })
    }

    fn detect_ps4_hid_controller() -> bool {
        let Ok(api) = HidApi::new() else {
            return false;
        };

        let has_candidate = api.device_list().any(is_ps4_hid_candidate);
        has_candidate
    }

    fn is_ps4_hid_candidate(device_info: &DeviceInfo) -> bool {
        if device_info.usage_page() != 0x0001 || device_info.usage() != 0x0005 {
            return false;
        }

        let product_name = device_info.product_string().unwrap_or("");
        let path = device_info.path().to_string_lossy().to_ascii_lowercase();
        product_name.contains("PS4") || path.contains("pid_0401")
    }

    fn sample_from_xinput_state(state: &XINPUT_STATE) -> InputSample {
        let gamepad = state.Gamepad;
        let buttons = gamepad.wButtons;

        let mut down_mask = 0u16;

        if has_xinput_button(buttons, XINPUT_GAMEPAD_A) {
            down_mask |= BUTTON_SOUTH_MASK;
        }
        if has_xinput_button(buttons, XINPUT_GAMEPAD_B) {
            down_mask |= BUTTON_EAST_MASK;
        }
        if has_xinput_button(buttons, XINPUT_GAMEPAD_X) {
            down_mask |= BUTTON_WEST_MASK;
        }
        if has_xinput_button(buttons, XINPUT_GAMEPAD_Y) {
            down_mask |= BUTTON_NORTH_MASK;
        }
        if has_xinput_button(buttons, XINPUT_GAMEPAD_LEFT_SHOULDER) {
            down_mask |= BUTTON_L1_MASK;
        }
        if has_xinput_button(buttons, XINPUT_GAMEPAD_RIGHT_SHOULDER) {
            down_mask |= BUTTON_R1_MASK;
        }
        if gamepad.bLeftTrigger >= XINPUT_TRIGGER_THRESHOLD {
            down_mask |= BUTTON_L2_MASK;
        }
        if gamepad.bRightTrigger >= XINPUT_TRIGGER_THRESHOLD {
            down_mask |= BUTTON_R2_MASK;
        }
        if has_xinput_button(buttons, XINPUT_GAMEPAD_BACK) {
            down_mask |= BUTTON_SELECT_MASK;
        }
        if has_xinput_button(buttons, XINPUT_GAMEPAD_START) {
            down_mask |= BUTTON_START_MASK;
        }
        if has_xinput_button(buttons, XINPUT_GAMEPAD_LEFT_THUMB) {
            down_mask |= BUTTON_L3_MASK;
        }
        if has_xinput_button(buttons, XINPUT_GAMEPAD_RIGHT_THUMB) {
            down_mask |= BUTTON_R3_MASK;
        }

        let dpad_up = has_xinput_button(buttons, XINPUT_GAMEPAD_DPAD_UP);
        let dpad_down = has_xinput_button(buttons, XINPUT_GAMEPAD_DPAD_DOWN);
        let dpad_left = has_xinput_button(buttons, XINPUT_GAMEPAD_DPAD_LEFT);
        let dpad_right = has_xinput_button(buttons, XINPUT_GAMEPAD_DPAD_RIGHT);

        if dpad_up {
            down_mask |= BUTTON_DPAD_UP_MASK;
        }
        if dpad_down {
            down_mask |= BUTTON_DPAD_DOWN_MASK;
        }
        if dpad_left {
            down_mask |= BUTTON_DPAD_LEFT_MASK;
        }
        if dpad_right {
            down_mask |= BUTTON_DPAD_RIGHT_MASK;
        }

        let up = dpad_up || gamepad.sThumbLY > XINPUT_AXIS_DEADZONE;
        let down = dpad_down || gamepad.sThumbLY < -XINPUT_AXIS_DEADZONE;
        let left = dpad_left || gamepad.sThumbLX < -XINPUT_AXIS_DEADZONE;
        let right = dpad_right || gamepad.sThumbLX > XINPUT_AXIS_DEADZONE;

        let horizontal = if right {
            1
        } else if left {
            -1
        } else {
            0
        };
        let vertical = if up {
            1
        } else if down {
            -1
        } else {
            0
        };

        InputSample {
            timestamp_ms: now_ms(),
            direction: to_direction(horizontal, vertical),
            down_mask,
        }
    }

    fn has_xinput_button(current: u16, expected: u16) -> bool {
        current & expected == expected
    }

    fn decode_gp2040_ps4_report(report: &[u8]) -> Option<(u8, u16)> {
        // GP2040-CE PS4 mode uses a DualShock 4-style input report (ID 0x01).
        if report.len() < 10 || report[0] != 0x01 {
            return None;
        }

        let buttons0 = report[5];
        let buttons1 = report[6];
        let left_trigger_analog = report[8];
        let right_trigger_analog = report[9];
        let mut down_mask = 0u16;

        if buttons0 & 0x20 != 0 {
            down_mask |= BUTTON_SOUTH_MASK;
        }
        if buttons0 & 0x40 != 0 {
            down_mask |= BUTTON_EAST_MASK;
        }
        if buttons0 & 0x10 != 0 {
            down_mask |= BUTTON_WEST_MASK;
        }
        if buttons0 & 0x80 != 0 {
            down_mask |= BUTTON_NORTH_MASK;
        }
        if buttons1 & 0x01 != 0 {
            down_mask |= BUTTON_L1_MASK;
        }
        if buttons1 & 0x02 != 0 {
            down_mask |= BUTTON_R1_MASK;
        }
        if buttons1 & 0x04 != 0 || left_trigger_analog >= TRIGGER_BYTE_THRESHOLD {
            down_mask |= BUTTON_L2_MASK;
        }
        if buttons1 & 0x08 != 0 || right_trigger_analog >= TRIGGER_BYTE_THRESHOLD {
            down_mask |= BUTTON_R2_MASK;
        }
        if buttons1 & 0x10 != 0 {
            down_mask |= BUTTON_SELECT_MASK;
        }
        if buttons1 & 0x20 != 0 {
            down_mask |= BUTTON_START_MASK;
        }
        if buttons1 & 0x40 != 0 {
            down_mask |= BUTTON_L3_MASK;
        }
        if buttons1 & 0x80 != 0 {
            down_mask |= BUTTON_R3_MASK;
        }

        let hat = buttons0 & 0x0F;
        let dpad_up = matches!(hat, 0 | 1 | 7);
        let dpad_down = matches!(hat, 3 | 4 | 5);
        let dpad_left = matches!(hat, 5 | 6 | 7);
        let dpad_right = matches!(hat, 1 | 2 | 3);

        if dpad_up {
            down_mask |= BUTTON_DPAD_UP_MASK;
        }
        if dpad_down {
            down_mask |= BUTTON_DPAD_DOWN_MASK;
        }
        if dpad_left {
            down_mask |= BUTTON_DPAD_LEFT_MASK;
        }
        if dpad_right {
            down_mask |= BUTTON_DPAD_RIGHT_MASK;
        }

        let hat_direction = direction_from_ds4_hat(hat);
        let direction = if hat_direction != 5 {
            hat_direction
        } else {
            direction_from_analog_stick(report[1], report[2])
        };

        Some((direction, down_mask))
    }

    fn to_direction(horizontal: i32, vertical: i32) -> u8 {
        match (horizontal, vertical) {
            (0, 0) => 5,
            (1, 0) => 6,
            (-1, 0) => 4,
            (0, 1) => 8,
            (0, -1) => 2,
            (1, 1) => 9,
            (-1, 1) => 7,
            (1, -1) => 3,
            _ => 1,
        }
    }

    fn direction_from_ds4_hat(hat: u8) -> u8 {
        match hat {
            0 => 8,
            1 => 9,
            2 => 6,
            3 => 3,
            4 => 2,
            5 => 1,
            6 => 4,
            7 => 7,
            _ => 5,
        }
    }

    fn direction_from_analog_stick(left_x: u8, left_y: u8) -> u8 {
        let horizontal = if left_x as i32 >= ANALOG_CENTER + ANALOG_AXIS_DEADZONE {
            1
        } else if left_x as i32 <= ANALOG_CENTER - ANALOG_AXIS_DEADZONE {
            -1
        } else {
            0
        };

        let vertical = if left_y as i32 <= ANALOG_CENTER - ANALOG_AXIS_DEADZONE {
            1
        } else if left_y as i32 >= ANALOG_CENTER + ANALOG_AXIS_DEADZONE {
            -1
        } else {
            0
        };

        to_direction(horizontal, vertical)
    }

    fn now_ms() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis() as u64)
            .unwrap_or(0)
    }
}

pub use imp::{input_detect, InputSource};
