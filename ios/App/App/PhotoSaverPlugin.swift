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
        if #available(iOS 14, *) {
            let addOnlyStatus = PHPhotoLibrary.authorizationStatus(for: .addOnly)
            switch addOnlyStatus {
            case .authorized:
                completion(true)
                return
            case .notDetermined:
                PHPhotoLibrary.requestAuthorization(for: .addOnly) { newStatus in
                    DispatchQueue.main.async {
                        if newStatus == .authorized {
                            completion(true)
                            return
                        }
                        self.requestReadWriteFallback(completion: completion)
                    }
                }
                return
            default:
                requestReadWriteFallback(completion: completion)
                return
            }
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

    @available(iOS 14, *)
    private func requestReadWriteFallback(completion: @escaping (Bool) -> Void) {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        switch status {
        case .authorized, .limited:
            completion(true)
        case .notDetermined:
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { newStatus in
                DispatchQueue.main.async {
                    completion(newStatus == .authorized || newStatus == .limited)
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