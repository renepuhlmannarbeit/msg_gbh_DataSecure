// Test-host helper only. Launch through the same system service used by Finder,
// with a private test profile; this does not simulate a Gatekeeper approval.
import AppKit
import Foundation

// Never quit by bundle identifier: another user instance may be running.
if CommandLine.arguments.count == 4 && CommandLine.arguments[1] == "--terminate" {
    let expected = URL(fileURLWithPath: CommandLine.arguments[2]).resolvingSymlinksInPath().standardizedFileURL
    guard let pid = Int32(CommandLine.arguments[3]), pid > 0,
          let application = NSRunningApplication(processIdentifier: pid),
          let actual = application.bundleURL?.resolvingSymlinksInPath().standardizedFileURL,
          actual == expected, application.terminate() else {
        FileHandle.standardError.write(Data("STANDALONE_TERMINATION_REQUEST_FAILED\n".utf8))
        exit(1)
    }
    exit(0) // Request accepted, not evidence of an exit code or completed exit.
}

guard CommandLine.arguments.count == 3 else { exit(64) }
let appURL = URL(fileURLWithPath: CommandLine.arguments[1])
let root = URL(fileURLWithPath: CommandLine.arguments[2])
let config = NSWorkspace.OpenConfiguration()
config.createsNewApplicationInstance = true
config.allowsRunningApplicationSubstitution = false
config.promptsUserIfNeeded = false
config.activates = false
config.environment = [
    "DATASECURE_STANDALONE_NATIVE_SMOKE_ROOT": root.path,
    "DATASECURE_STANDALONE_DOCUMENTS_DIR": root.appendingPathComponent("profile/Documents").path,
    "HOME": root.appendingPathComponent("profile").path,
    "USERPROFILE": root.appendingPathComponent("profile").path,
    "LOCALAPPDATA": root.appendingPathComponent("profile/Local").path,
    "APPDATA": root.appendingPathComponent("profile/Roaming").path,
    "XDG_DATA_HOME": root.appendingPathComponent("profile/Xdg").path,
    "TEMP": root.appendingPathComponent("temp").path,
    "TMP": root.appendingPathComponent("temp").path,
    "TMPDIR": root.appendingPathComponent("temp").path,
    "PATH": "/usr/bin:/bin:/usr/sbin:/sbin"
]
NSWorkspace.shared.openApplication(at: appURL, configuration: config) { application, error in
    guard error == nil, let application = application else {
        FileHandle.standardError.write(Data("STANDALONE_LAUNCH_SERVICES_FAILED\n".utf8))
        exit(1)
    }
    print(application.processIdentifier)
    exit(0)
}
DispatchQueue.main.asyncAfter(deadline: .now() + 30) {
    FileHandle.standardError.write(Data("STANDALONE_LAUNCH_SERVICES_TIMEOUT\n".utf8))
    exit(1)
}
RunLoop.main.run()
