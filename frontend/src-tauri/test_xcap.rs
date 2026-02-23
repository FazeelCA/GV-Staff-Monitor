use xcap::Monitor;
fn main() {
    let monitors = Monitor::all().unwrap();
    for monitor in monitors {
        let p = monitor.is_primary();
        println!("Monitor {} is primary: {}", monitor.name(), p);
    }
}
