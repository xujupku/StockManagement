#[cfg(not(dev))]
use tauri::{ipc::CapabilityBuilder, Manager, Url};
use tauri::{WebviewUrl, WebviewWindowBuilder};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let port = portpicker::pick_unused_port().expect("failed to find unused port");

  tauri::Builder::default()
    .plugin(tauri_plugin_localhost::Builder::new(port).build())
    .plugin(tauri_plugin_http::init())
    .setup(move |app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      #[cfg(dev)]
      let url = WebviewUrl::App("/".into());

      #[cfg(not(dev))]
      let url = {
        let url: Url = format!("http://localhost:{port}").parse().unwrap();

        app.add_capability(
          CapabilityBuilder::new("localhost")
            .remote(url.to_string())
            .window("main"),
        )?;

        WebviewUrl::External(url)
      };

      WebviewWindowBuilder::new(app, "main", url)
        .title("AI股票投资管家")
        .build()?;

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
