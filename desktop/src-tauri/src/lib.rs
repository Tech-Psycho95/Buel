use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

const APP_ORIGIN: &str = "https://buel-app.vercel.app";
const LEGACY_ORIGIN: &str = "https://sentisel.vercel.app";

/// Origins that may be navigated inside the app window. Anything else is
/// opened in the user's default browser (never silently embedded).
fn is_allowed(url: &tauri::Url) -> bool {
    let s = url.as_str();
    s.starts_with("tauri://localhost")
        || s.starts_with("http://tauri.localhost")
        || s.starts_with(APP_ORIGIN)
        || s.starts_with(LEGACY_ORIGIN)
        // Privy authentication hops (OAuth redirect flow + hosted UI)
        || s.starts_with("https://auth.privy.io")
        || s.starts_with("https://privy.io")
        // Google account chooser during the OAuth redirect flow
        || s.starts_with("https://accounts.google.com")
        || s.starts_with("https://myaccount.google.com")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();

            let window = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::App("index.html".into()),
            )
            .title("BUEL")
            .inner_size(1440.0, 900.0)
            .min_inner_size(1024.0, 700.0)
            .on_navigation(move |url| {
                if is_allowed(url) {
                    true
                } else {
                    // Untrusted destination: hand off to the system browser
                    // instead of embedding it.
                    let target = url.as_str().to_string();
                    let h = handle.clone();
                    std::thread::spawn(move || {
                        use tauri_plugin_opener::OpenerExt;
                        let _ = h.opener().open_url(target, None::<&str>);
                    });
                    false
                }
            })
            .build()?;

            let _ = window;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running BUEL desktop application");
}
