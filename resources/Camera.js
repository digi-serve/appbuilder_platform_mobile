/**
 * @class Camera
 *
 * Manages taking photos with the device's camera, and saving them to the
 * app's data directory.
 *
 * You can use getCameraPhoto() or getLibraryPhoto() to obtain an image file.
 *
 * Previously, it was possible to use the `url` or `cdvfile` value of that
 * image to display the image in the DOM (inside an <img> tag). This is no
 * longer possible in iOS.
 * 
 * To display a camera image in the DOM, you can use the base64 data. First
 * you need the `filename` of the image that was provided earlier from 
 * getGameraPhoto(). Then use base64ByName().
 *
 *      camera
 *          .getCameraPhoto()
 *          .then((photo) => {
 *              return camera.base64ByName(photo.filename)
 *          })
 *          .then((base64Data) => {
 *              return '<img src="data:image/jpg;base64,' + base64Data + '" />'
 *          })
 *
 * Exports a singleton instance.
 */
"use strict";

import CameraPlatform from "./CameraPlatform";
import CameraBrowser from "./CameraBrowser";

var camera = null;

// `navigator.camera` is not available even on the actual device, until
// the 'deviceready' event has fired.
//if (navigator.camera) {

if (window.cordova) {
   camera = new CameraPlatform();
} else {
   camera = new CameraBrowser();
}
export default camera;
