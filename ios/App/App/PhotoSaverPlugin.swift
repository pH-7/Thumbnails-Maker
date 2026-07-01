import Capacitor
import Foundation
import Photos

@objc(PhotoSaverPlugin)
public class PhotoSaverPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhotoSaverPlugin"
    public let jsName = "PhotoSaver"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveImage", returnType: CAPPluginReturnPromise)
    ]

    @objc func saveImage(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            guard let base64Data = call.getString("data"), !base64Data.isEmpty else {
                call.reject("Missing image data.")
                return
            }

            guard let imageData = self.decodeImageData(base64Data) else {
                call.reject("Could not decode image data.")
                return
            }

            self.requestPhotoAccess { granted in
                guard granted else {
                    call.reject("Photos access was denied. Please allow Photos access in Settings.")
                    return
                }

                self.saveToPhotoLibrary(imageData: imageData, call: call)
            }
        }
    }

    private func decodeImageData(_ rawValue: String) -> Data? {
        let value: String

        if let commaIndex = rawValue.firstIndex(of: ",") {
            value = String(rawValue[rawValue.index(after: commaIndex)...])
        } else {
            value = rawValue
        }

        return Data(base64Encoded: value, options: [.ignoreUnknownCharacters])
    }

    private func requestPhotoAccess(completion: @escaping (Bool) -> Void) {
        // Saving only needs "add" access, so request the minimal add-only
        // permission on iOS 14+. This shows the system prompt on first use and
        // never presents a second, confusing prompt.
        if #available(iOS 14, *) {
            let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
            switch status {
            case .authorized, .limited:
                completion(true)
            case .notDetermined:
                PHPhotoLibrary.requestAuthorization(for: .addOnly) { newStatus in
                    DispatchQueue.main.async {
                        completion(newStatus == .authorized || newStatus == .limited)
                    }
                }
            default:
                completion(false)
            }
            return
        }

        let status = PHPhotoLibrary.authorizationStatus()
        switch status {
        case .authorized:
            completion(true)
        case .notDetermined:
            PHPhotoLibrary.requestAuthorization { newStatus in
                DispatchQueue.main.async {
                    completion(newStatus == .authorized)
                }
            }
        default:
            completion(false)
        }
    }

    private func saveToPhotoLibrary(imageData: Data, call: CAPPluginCall) {
        PHPhotoLibrary.shared().performChanges({
            let creationRequest = PHAssetCreationRequest.forAsset()
            creationRequest.addResource(with: .photo, data: imageData, options: nil)
        }) { success, error in
            DispatchQueue.main.async {
                if let error = error {
                    call.reject("Could not save image to Photos.", nil, error)
                    return
                }

                if success {
                    call.resolve([
                        "saved": true
                    ])
                    return
                }

                call.reject("Could not save image to Photos.")
            }
        }
    }
}