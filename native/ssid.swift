// Happ Bridge — SSID helper for macOS.
//
// SSID is location data: macOS hides it unless the *responsible process* has
// Location Services authorization. When spawned via execFile from Electron's
// main process, this helper inherits the app's bundle identity, so the first
// run triggers the system Location prompt under the app's name and — once
// granted — `CWWiFiClient` returns the real SSID.
//
// Output: current Wi-Fi SSID on stdout (single line), nothing on failure.

import Foundation
import CoreLocation
import CoreWLAN

// Request when-in-use authorization so the OS is allowed to hand SSID to us.
// If already granted this resolves immediately.
func ensureLocationAuthorization(timeout: TimeInterval) {
    let manager = CLLocationManager()
    guard CLLocationManager.locationServicesEnabled() else { return }
    if manager.authorizationStatus == .notDetermined {
        manager.requestWhenInUseAuthorization()
    }

    let start = Date()
    while Date().timeIntervalSince(start) < timeout {
        let status = manager.authorizationStatus
        // macOS reuses .authorized (there is no when-in-use variant).
        if status == .authorized || status == .denied || status == .restricted {
            break
        }
        Thread.sleep(forTimeInterval: 0.2)
    }
}

func currentSSID() -> String? {
    guard let iface = CWWiFiClient.shared().interface() else { return nil }
    return iface.ssid()
}

ensureLocationAuthorization(timeout: 8)
// Give the OS a moment to settle before reading the SSID.
Thread.sleep(forTimeInterval: 0.5)

if let ssid = currentSSID() {
    print(ssid)
}