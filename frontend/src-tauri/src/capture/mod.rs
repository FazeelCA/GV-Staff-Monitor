#[cfg(target_os = "windows")]
pub mod windows;

#[cfg(not(target_os = "windows"))]
pub mod macos;

#[cfg(target_os = "windows")]
pub use windows::capture_desktop;

#[cfg(not(target_os = "windows"))]
pub use macos::capture_desktop;
