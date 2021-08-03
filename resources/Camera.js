/**
 * @class Camera
 *
 * Manages taking photos with the device's camera, and saving them to the
 * app's data directory.
 *
 * You can use getCameraPhoto() and getLibraryPhoto() to get the image URL
 * for putting into <img> tags or whatever.
 * The URL is not permanent. You should store the image filename, and
 * then later you can use loadPhotoByName() to get the new URL from the filename
 * when you need it.
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
