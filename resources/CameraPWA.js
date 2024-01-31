/**
 * @class CameraPWA
 *
 * Manages taking photos with the device's camera, and saving them to the
 * app's data directory.
 *
 * You can use getCameraPhoto() or getLibraryPhoto() to obtain an image file.
 *
 * Previously, it was possible to use the permanent `cdvfile` value of that
 * image to display it in the DOM (inside an <img> tag). This is no longer
 * possible. Now only the temporary `url` value can be displayed.
 *
 * Because it is temporary, the `url` cannot be reliably stored for future use.
 * Instead, store the image filename. Then later when you need to display the
 * image, use loadPhotoByName(filename) to obtain a fresh `.url` from the
 * result.
 *
 * Exports a singleton instance.
 */
"use strict";

import EventEmitter from "eventemitter2";
import Log from "./Log";
import uuid from "uuid/v1";

// import { Decoder } from "@nuintun/qrcode";
// import { Decoder } from "@nuintun/qrcode";
import fileStorage from "./FileStorage.js";
const DEFAULT_HEIGHT = 2000;
const DEFAULT_WIDTH = 2000;
// maximum size for passage through relay seems to be about 500000 bytes
const MAX_IMAGE_SIZE = 500000;

class CameraPWA extends EventEmitter {
   constructor() {
      super();

      // backend HTML elements
      this._$backend = null;
      this._$input = null;
      this._$reset = null;

      this.init();
   }

   get validImageTypes() {
      return ["image/jpg", "image/jpeg", "image/png", "image/gif", "image/bmp"];
   }

   /**
    * Internal function to trigger the device camera and deliver the image
    * file.
    *
    * @param {string} type
    *    Either 'camera' or 'library'
    * @return {Promise}
    *    Resolves with a {File}
    */
   _getPicture(type = "camera") {
      return new Promise((resolve, reject) => {
         // Get new picture from device camera
         if (type == "camera") {
            this._$input.attr("capture", "camera");
         }
         // Get picture from device photo album
         else {
            this._$input.removeAttr("capture");
         }

         // Enable
         let isCameraActive = true;
         $("body").append(this._$backend);

         // Event handling
         this._$input.one("change", () => {
            if (isCameraActive) {
               isCameraActive = false;
               let file = this._$input.get(0).files[0];
               // A photo was captured
               if (file) {
                  if (this.validImageTypes.includes(file["type"])) {
                     resolve(file);
                  } else {
                     console.log("File is not valid.", file.type, file);
                     reject(new Error("File is not valid"));
                  }
               }
               // Sometimes the 'change' event triggers on a cancel
               else {
                  reject(new Error("Canceled"));
               }
            }
         });
         $(window).one("focus", () => {
            // This 'focus' event fires after the camera dialog closes and
            // the original page gets focus again.
            setTimeout(() => {
               // Clear file list
               this._$reset.trigger("click");
               // Clean up DOM
               this._$backend.remove();
               // If cancel happened with no 'change' event we will catch it here
               if (isCameraActive) {
                  isCameraActive = false;
                  reject(new Error("Canceled"));
               }
            }, 600);
         });

         // Activate the device camera
         this._$input.trigger("click");
      });
   }

   /**
    * Verify the file type.
    *
    * @param {string} type
    */
   _checkFileType(type) {
      if (!this.validImageTypes.includes(type))
         throw new Error("This file type is invalid.");
   }

   /**
    * Recursively compresses the given file, if needed, and delivers it as a base64 ASCII string.
    *
    * @param {File} file
    *      The file to compress and process.
    * @param {number} quality
    *      The desired compression quality, a decimal value between 0 and 1.
    * @return {Promise<File>}
    *      Resolves with a file containing the compressed image data.
    */
   async _recurseShrink(file, quality, options = {}) {
      if (file.size < MAX_IMAGE_SIZE) return file;
      let recurseShrinkTimeout;
      const GAIN_FATOR = 0.1;
      let qualityValue = quality ?? 1;
      let qualityGain = (() => {
         const decimalNum = qualityValue.toString().split(".")[1] || "";
         let decimalPlaces = 0;
         for (let i = 0; i < decimalNum.length; i++)
            if (parseInt(decimalNum[i]) > 0) {
               decimalPlaces = i + 1;
               break;
            }
         return 1 / Math.pow(10, decimalPlaces);
      })();
      let qualityFactor = 0.1 * qualityGain;
      const modFactor = qualityGain / qualityFactor;
      let compressionTimes = 0;
      const compressFile = async (file) => {
         let compressedFile = file;
         if (recurseShrinkTimeout === null) return compressedFile;
         qualityValue = qualityValue - qualityFactor;
         if (compressionTimes % modFactor === 0 || qualityValue <= 0) {
            qualityGain = qualityGain * GAIN_FATOR;
            qualityFactor = qualityFactor * qualityGain;
            qualityValue = qualityGain;
         }
         compressedFile = await fileStorage.compress(file, {
            quality: qualityValue,
         });
         compressionTimes++;
         if (compressedFile.size > MAX_IMAGE_SIZE)
            return await compressFile(file);
         return compressedFile;
      };
      return await new Promise((resolve, reject) => {
         if (options.timeout != null)
            recurseShrinkTimeout = setTimeout(() => {
               reject(
                  new Error("Timeout compressing image. Try a smaller one?"),
               );
               recurseShrinkTimeout = null;
            }, options.timeout);
         const processCompression = async () => {
            let compressedFile = await fileStorage.compress(file, {
               convertSize: MAX_IMAGE_SIZE,
            });
            compressionTimes++;
            if (compressedFile.size > MAX_IMAGE_SIZE)
               compressedFile = await compressFile(compressedFile);
            resolve(compressedFile);
            if (recurseShrinkTimeout == null) return;
            clearTimeout(recurseShrinkTimeout);
            recurseShrinkTimeout = null;
         };
         processCompression();
      });
   }

   init() {
      // Hidden HTML elements used to trigger camera in _getPicture()
      this._$backend = $(`
         <form style="
               display: block;
               position: absolute;
               bottom: 0;
               right: 0;
               visibility: hidden;
         ">
            <input data-cy="hiddenFileInput" type="file" accept="image/jpeg,image/jpg,image/gif,image/png" capture="camera" />
            <input type="reset" />
         </form>
      `);
      this._$input = this._$backend.find("input[type='file']");
      this._$reset = this._$backend.find("input[type='reset']");
   }

   //////
   //  Camera
   //////

   /**
    * Activate the camera for the user, and obtain the photo taken.
    *
    * @param {int} width
    * @param {int} height
    * @return {Promise}
    *    Resolves with metadata of the saved photo.
    *    {
    *       filename: <string>,
    *       File: <File|Blob>,
    *       url: <string> // only valid for current session
    *    }
    */
   async getCameraPhoto(
      width = DEFAULT_WIDTH,
      height = DEFAULT_HEIGHT,
      timeout = 5000,
   ) {
      try {
         const file = await this._getPicture("camera");

         // check the format and the size of the image
         // if it is not a jpeg or png reject the promise
         if (!this.validImageTypes.includes(file["type"]))
            throw new Error("Image is not a valid type");

         const compressFile = await this._recurseShrink(file, null, {
            timeout,
         });
         const imageUUID = uuid();
         return {
            uuid: imageUUID,
            filename: `${imageUUID}_${compressFile.name}`,
            fileEntry: compressFile,
         };
      } catch (err) {
         // User canceled the photo. Not a real error.
         if (err.message !== "Canceled")
            Log("CameraPWA:getCameraPhoto():Error", err);
         throw err;
      }
   }

   /**
    * Prompt the user to select an existing photo from their library, and
    * obtain a copy of the chosen photo.
    *
    * @param {int} width
    * @param {int} height
    * @return {Promise}
    *    Resolves with metadata of the copied photo.
    *    {
    *       filename: <string>,
    *       File: <File|Blob>,
    *       url: <string> // only valid for current session
    *    }
    */
   async getLibraryPhoto(
      width = DEFAULT_WIDTH,
      height = DEFAULT_HEIGHT,
      timeout = 10000,
   ) {
      try {
         const file = await this._recurseShrink(
            await this._getPicture("library"),
            null,
            {
               timeout,
            },
         );
         const imageUUID = uuid();
         return {
            uuid: imageUUID,
            filename: `${imageUUID}_${file.name}`,
            fileEntry: file,
         };
      } catch (err) {
         // User canceled the photo. Not a real error.
         if (err.message !== "Canceled")
            Log("CameraPWA:getCameraPhoto():Error", err);
         throw err;
      }
   }

   ////////
   // Photo file management
   ////////

   /**
    * Convert a File object into a base64 data.
    *
    * @param {File} file
    * @return {string}
    */
   async convertToBase64Data(file) {
      this._checkFileType(file.type);
      return await fileStorage.convertFileToBase64Data(file);
   }


   /**
    * Convert base64 data into a File object.
    *
    * @param {string} filename
    * @param {string} type
    * @param {string} base64Data
    * @return {File}
    */
   convertToFile(filename, type, base64Data) {
      this._checkFileType(type);
      return fileStorage.convertBase64DataToFile(filename, base64Data, { type });
   }

   /**
    * Loads a previously saved photo by its uuid.
    *
    * @param {string} key
    * @return {Promise}
    */
   async findPhoto(key) {
      return {
         uuid: key,
         data: await fileStorage.get(key),
      };
   }

   /**
    * Save a File object to Local Storage.
    *
    * @param {string} key
    * @param {File} file
    * @return {Promise}
    */
   async savePhoto(key, file) {
      if (!(file instanceof File))
         throw new Error('The "file" parameter is not a File object.');
      this._checkFileType(file.type);
      await fileStorage.put(key, file);
      return {
         uuid: key,
         data: file,
      };
   }

   /**
    * Remove a photo by its filename.
    *
    * @param {string} key
    * @return {Promise}
    */
   deletePhoto(key) {
      return fileStorage.delete(key);
   }

   /**
    *  Remove all locally saved photos
    * @return {Promise}
    */
   deletePhotos() {
      return fileStorage.deleteAll();
   }

   /**
    * Calculate the total size of all locally saved images?
    * @return {Promise}
    *    Resolves with {int} total storage in MB
    */
   imageLookUp() {
      return fileStorage.getTotalSize().then((sizeInBytes) => {
         sizeInBytes = sizeInBytes || 0;
         let sizeInMegabytes = Number(sizeInBytes / 1024 / 1024).toFixed(2);
         console.log("Total Storage: " + sizeInMegabytes);
         return sizeInMegabytes;
      });
   }
}

export default CameraPWA;
