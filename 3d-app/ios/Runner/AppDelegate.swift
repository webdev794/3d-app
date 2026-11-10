import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    // Pay now: the invoice's pay page opens in Safari (Apple Pay works there). Only http(s) links;
    // false when it could not open.
    let browser = FlutterMethodChannel(name: "3deezi/browser", binaryMessenger: engineBridge.applicationRegistrar.messenger())
    browser.setMethodCallHandler { call, result in
      guard call.method == "open" else {
        result(FlutterMethodNotImplemented)
        return
      }
      guard let args = call.arguments as? [String: Any], let text = args["url"] as? String,
            let url = URL(string: text), let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http" else {
        result(false)
        return
      }
      UIApplication.shared.open(url, options: [:]) { opened in result(opened) }
    }
    // Puts the keyboard away whoever opened it: the app calls it when a keyboard is
    // still up and none of its own text boxes is in use (a web page's box, e.g. the
    // Artboard's, after leaving that screen). iPhone keyboards have no hide key.
    let keyboard = FlutterMethodChannel(name: "3deezi/keyboard", binaryMessenger: engineBridge.applicationRegistrar.messenger())
    keyboard.setMethodCallHandler { call, result in
      guard call.method == "hide" else {
        result(FlutterMethodNotImplemented)
        return
      }
      UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
      result(nil)
    }
  }
}
