/**
 * @class Camera
 *
 * Manages taking photos with the device's camera, and saving them to the
 * app's data directory.
 *
 * You can use getCameraPhoto() or getLibraryPhoto() to obtain an image file.
 *
 * You can use the `url` value of that image to display the image in the 
 * DOM (inside an <img> tag). This URL is only valid for the current session.
 *
 *      camera
 *          .getCameraPhoto()
 *          .then((photo) => {
 *              storage.set('photo-filename', photo.filename);
 *              return '<img src="' + photo.url + '" />'
 *          })
 *
 * 
 *      storage.get('photo-filename')
 *          .then((filename) => {
 *             return camera.loadPhotoByName(filename);
 *          })
 *          .then((photo) => {
 *             return '<img src="' + photo.url + '" />'
 *          })
 * 
 * Exports a singleton instance.
 */
"use strict";

import CameraBrowser from "./CameraBrowser";
import CameraPWA from "./CameraPWA";

var camera = null;

// PWA api only works over https
if (document.location.protocol == 'https') {
   camera = new CameraPWA();
} 
// Otherwise use local browser camera workaround
else {
   camera = new CameraBrowser();
}
export default camera;
