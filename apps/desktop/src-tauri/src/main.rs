#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod xinput;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            xinput::spawn_xinput_bridge(handle);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run the SF6 Combo Master desktop shell");
}
