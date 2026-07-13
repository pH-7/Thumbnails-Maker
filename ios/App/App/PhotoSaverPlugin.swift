import Capacitor
import Foundation
import Photos
import UIKit

@objc(PhotoSaverPlugin)
public class PhotoSaverPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhotoSaverPlugin"
    public let jsName = "PhotoSaver"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveImage", returnType: CAPPluginReturnPromise)
    ]

    @objc public override func checkPermissions(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            call.resolve(self.permissionResult(for: self.currentPhotoAddStatus()))
        }
    }

    @objc public override func requestPermissions(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            self.requestPhotoAddAccess { status in
                call.resolve(self.permissionResult(for: status))
            }
        }
    }

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

            guard UIImage(data: imageData) != nil else {
                call.reject("The generated thumbnail could not be read as an image.")
                return
            }

            self.requestPhotoAddAccess { status in
                guard self.isPhotoAddStatusGranted(status) else {
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

    private func currentPhotoAddStatus() -> PHAuthorizationStatus {
        if #available(iOS 14, *) {
            return PHPhotoLibrary.authorizationStatus(for: .addOnly)
        }

        return PHPhotoLibrary.authorizationStatus()
    }

    private func requestPhotoAddAccess(completion: @escaping (PHAuthorizationStatus) -> Void) {
        // Saving only needs "add" access, so request the minimal add-only
        // permission on iOS 14+. This shows the system prompt on first use and
        // never presents a second, confusing prompt.
        if #available(iOS 14, *) {
            let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
            switch status {
            case .authorized, .limited, .denied, .restricted:
                completion(status)
            case .notDetermined:
                PHPhotoLibrary.requestAuthorization(for: .addOnly) { newStatus in
                    DispatchQueue.main.async {
                        completion(newStatus)
                    }
                }
            @unknown default:
                completion(status)
            }
            return
        }

        let status = PHPhotoLibrary.authorizationStatus()
        switch status {
        case .authorized, .denied, .restricted:
            completion(status)
        case .notDetermined:
            PHPhotoLibrary.requestAuthorization { newStatus in
                DispatchQueue.main.async {
                    completion(newStatus)
                }
            }
        default:
            completion(status)
        }
    }

    private func isPhotoAddStatusGranted(_ status: PHAuthorizationStatus) -> Bool {
        if status == .authorized {
            return true
        }

        if #available(iOS 14, *), status == .limited {
            return true
        }

        return false
    }

    private func permissionResult(for status: PHAuthorizationStatus) -> [String: String] {
        if status == .authorized {
            return ["photos": "granted"]
        }

        if #available(iOS 14, *), status == .limited {
            return ["photos": "limited"]
        }

        switch status {
        case .denied, .restricted:
            return ["photos": "denied"]
        case .notDetermined:
            return ["photos": "prompt"]
        default:
            return ["photos": "denied"]
        }
    }

    private func saveToPhotoLibrary(imageData: Data, call: CAPPluginCall) {
        PHPhotoLibrary.shared().performChanges({
            let creationRequest = PHAssetCreationRequest.forAsset()
            let options = PHAssetResourceCreationOptions()
            options.originalFilename = call.getString("fileName") ?? "thumbnail.png"
            creationRequest.addResource(with: .photo, data: imageData, options: options)
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
