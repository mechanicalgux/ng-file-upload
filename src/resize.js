ngFileUpload.service('UploadResize', ['UploadValidate', '$q', function (UploadValidate, $q) {
  var upload = UploadValidate;

  /**
   * Conserve aspect ratio of the original region. Useful when shrinking/enlarging
   * images to fit into a certain area.
   * Source:  http://stackoverflow.com/a/14731922
   *
   * @param {Number} srcWidth Source area width
   * @param {Number} srcHeight Source area height
   * @param {Number} maxWidth Nestable area maximum available width
   * @param {Number} maxHeight Nestable area maximum available height
   * @return {Object} { width, height }
   */
  var calculateAspectRatioFit = function (srcWidth, srcHeight, maxWidth, maxHeight, centerCrop) {
    var ratio = centerCrop ? Math.max(maxWidth / srcWidth, maxHeight / srcHeight) :
      Math.min(maxWidth / srcWidth, maxHeight / srcHeight);
    return {
      width: srcWidth * ratio, height: srcHeight * ratio,
      marginX: srcWidth * ratio - maxWidth, marginY: srcHeight * ratio - maxHeight
    };
  };

  // scales the image by (float) scale < 1
  // returns a canvas containing the scaled image.
  function downScaleImage(img, scale) {
    var imgCV = document.createElement('canvas');
    imgCV.width = img.width;
    imgCV.height = img.height;
    var imgCtx = imgCV.getContext('2d');
    imgCtx.drawImage(img, 0, 0);
    return downScaleCanvas(imgCV, scale);
  }

  // ----------------
  // Downscale algorithm for a better quality
  // Code by GameAlchemist https://stackoverflow.com/users/856501/gamealchemist
  // https://stackoverflow.com/questions/18922880/html5-canvas-resize-downscale-image-high-quality/19144434#19144434
  //
  // scales the canvas by (float) scale < 1
  // returns a new canvas containing the scaled image.
  function downScaleCanvas(cv, scale) {
    if (!(scale < 1 && scale > 0)) throw ('scale must be a positive number <1 ');
    var sqScale = scale * scale; // square scale = area of source pixel within target
    var sw = cv.width; // source image width
    var sh = cv.height; // source image height
    var tw = Math.floor(sw * scale); // target image width
    var th = Math.floor(sh * scale); // target image height
    var sx = 0, sy = 0, sIndex = 0; // source x,y, index within source array
    var tx = 0, ty = 0, yIndex = 0, tIndex = 0; // target x,y, x,y index within target array
    var tX = 0, tY = 0; // rounded tx, ty
    var w = 0, nw = 0, wx = 0, nwx = 0, wy = 0, nwy = 0; // weight / next weight x / y
    // weight is weight of current source point within target.
    // next weight is weight of current source point within next target's point.
    var crossX = false; // does scaled px cross its current px right border ?
    var crossY = false; // does scaled px cross its current px bottom border ?
    var sBuffer = cv.getContext('2d').getImageData(0, 0, sw, sh).data; // source buffer 8 bit rgba
    var tBuffer = new Float32Array(3 * tw * th); // target buffer Float32 rgb
    var sR = 0, sG = 0, sB = 0; // source's current point r,g,b
    /* untested !
     var sA = 0;  //source alpha  */

    for (sy = 0; sy < sh; sy++) {
      ty = sy * scale; // y src position within target
      tY = 0 | ty;     // rounded : target pixel's y
      yIndex = 3 * tY * tw;  // line index within target array
      crossY = (tY !== (0 | ty + scale));
      if (crossY) { // if pixel is crossing botton target pixel
        wy = (tY + 1 - ty); // weight of point within target pixel
        nwy = (ty + scale - tY - 1); // ... within y+1 target pixel
      }
      for (sx = 0; sx < sw; sx++, sIndex += 4) {
        tx = sx * scale; // x src position within target
        tX = 0 | tx;    // rounded : target pixel's x
        tIndex = yIndex + tX * 3; // target pixel index within target array
        crossX = (tX !== (0 | tx + scale));
        if (crossX) { // if pixel is crossing target pixel's right
          wx = (tX + 1 - tx); // weight of point within target pixel
          nwx = (tx + scale - tX - 1); // ... within x+1 target pixel
        }
        sR = sBuffer[sIndex];   // retrieving r,g,b for curr src px.
        sG = sBuffer[sIndex + 1];
        sB = sBuffer[sIndex + 2];

        /* !! untested : handling alpha !!
         sA = sBuffer[sIndex + 3];
         if (!sA) continue;
         if (sA != 0xFF) {
         sR = (sR * sA) >> 8;  // or use /256 instead ??
         sG = (sG * sA) >> 8;
         sB = (sB * sA) >> 8;
         }
         */
        if (!crossX && !crossY) { // pixel does not cross
          // just add components weighted by squared scale.
          tBuffer[tIndex] += sR * sqScale;
          tBuffer[tIndex + 1] += sG * sqScale;
          tBuffer[tIndex + 2] += sB * sqScale;
        } else if (crossX && !crossY) { // cross on X only
          w = wx * scale;
          // add weighted component for current px
          tBuffer[tIndex] += sR * w;
          tBuffer[tIndex + 1] += sG * w;
          tBuffer[tIndex + 2] += sB * w;
          // add weighted component for next (tX+1) px
          nw = nwx * scale;
          tBuffer[tIndex + 3] += sR * nw;
          tBuffer[tIndex + 4] += sG * nw;
          tBuffer[tIndex + 5] += sB * nw;
        } else if (crossY && !crossX) { // cross on Y only
          w = wy * scale;
          // add weighted component for current px
          tBuffer[tIndex] += sR * w;
          tBuffer[tIndex + 1] += sG * w;
          tBuffer[tIndex + 2] += sB * w;
          // add weighted component for next (tY+1) px
          nw = nwy * scale;
          tBuffer[tIndex + 3 * tw] += sR * nw;
          tBuffer[tIndex + 3 * tw + 1] += sG * nw;
          tBuffer[tIndex + 3 * tw + 2] += sB * nw;
        } else { // crosses both x and y : four target points involved
          // add weighted component for current px
          w = wx * wy;
          tBuffer[tIndex] += sR * w;
          tBuffer[tIndex + 1] += sG * w;
          tBuffer[tIndex + 2] += sB * w;
          // for tX + 1; tY px
          nw = nwx * wy;
          tBuffer[tIndex + 3] += sR * nw;
          tBuffer[tIndex + 4] += sG * nw;
          tBuffer[tIndex + 5] += sB * nw;
          // for tX ; tY + 1 px
          nw = wx * nwy;
          tBuffer[tIndex + 3 * tw] += sR * nw;
          tBuffer[tIndex + 3 * tw + 1] += sG * nw;
          tBuffer[tIndex + 3 * tw + 2] += sB * nw;
          // for tX + 1 ; tY +1 px
          nw = nwx * nwy;
          tBuffer[tIndex + 3 * tw + 3] += sR * nw;
          tBuffer[tIndex + 3 * tw + 4] += sG * nw;
          tBuffer[tIndex + 3 * tw + 5] += sB * nw;
        }
      } // end for sx
    } // end for sy

    // create result canvas
    var resCV = document.createElement('canvas');
    resCV.width = tw;
    resCV.height = th;
    var resCtx = resCV.getContext('2d');
    var imgRes = resCtx.getImageData(0, 0, tw, th);
    var tByteBuffer = imgRes.data;
    // convert float32 array into a UInt8Clamped Array
    var pxIndex = 0; //
    for (sIndex = 0, tIndex = 0; pxIndex < tw * th; sIndex += 3, tIndex += 4, pxIndex++) {
      tByteBuffer[tIndex] = Math.ceil(tBuffer[sIndex]);
      tByteBuffer[tIndex + 1] = Math.ceil(tBuffer[sIndex + 1]);
      tByteBuffer[tIndex + 2] = Math.ceil(tBuffer[sIndex + 2]);
      tByteBuffer[tIndex + 3] = 255;
    }
    // writing result to canvas.
    resCtx.putImageData(imgRes, 0, 0);
    return resCV;
  }

  // Extracted from https://github.com/romelgomez/angular-firebase-image-upload/blob/master/app/scripts/fileUpload.js#L89
  var resize = function (imagen, width, height, quality, type, ratio, centerCrop, resizeIf) {
    var deferred = $q.defer();
    var canvasElement = document.createElement('canvas');
    var imageElement = document.createElement('img');
    imageElement.setAttribute('style', 'visibility:hidden;position:fixed;z-index:-100000');
    document.body.appendChild(imageElement);

    imageElement.onload = function () {
      var imgWidth = imageElement.width, imgHeight = imageElement.height;
      imageElement.parentNode.removeChild(imageElement);
      if (resizeIf != null && resizeIf(imgWidth, imgHeight) === false) {
        deferred.reject('resizeIf');
        return;
      }
      try {
        if (ratio) {
          var ratioFloat = upload.ratioToFloat(ratio);
          var imgRatio = imgWidth / imgHeight;
          if (imgRatio < ratioFloat) {
            width = imgWidth;
            height = width / ratioFloat;
          } else {
            height = imgHeight;
            width = height * ratioFloat;
          }
        }
        if (!width) {
          width = imgWidth;
        }
        if (!height) {
          height = imgHeight;
        }
        var dimensions = calculateAspectRatioFit(imgWidth, imgHeight, width, height, centerCrop);
        canvasElement.width = Math.min(dimensions.width, width);
        canvasElement.height = Math.min(dimensions.height, height);
        var context = canvasElement.getContext('2d');
        var finalRatio = dimensions.width / imageElement.width;
        var scaledImage = null;

        try {
          scaledImage = downScaleImage(imageElement, finalRatio);
        } catch(e) {
          scaledImage = imageElement;
        }

        context.drawImage(scaledImage,
          Math.min(0, -dimensions.marginX / 2), Math.min(0, -dimensions.marginY / 2),
          dimensions.width, dimensions.height);
        deferred.resolve(canvasElement.toDataURL(type || 'image/WebP', quality || 0.934));
      } catch (e) {
        deferred.reject(e);
      }
    };
    imageElement.onerror = function () {
      imageElement.parentNode.removeChild(imageElement);
      deferred.reject();
    };
    imageElement.src = imagen;
    return deferred.promise;
  };

  upload.dataUrltoBlob = function (dataurl, name, origSize) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
      bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    var blob = new window.Blob([u8arr], {type: mime});
    blob.name = name;
    blob.$ngfOrigSize = origSize;
    return blob;
  };

  upload.isResizeSupported = function () {
    var elem = document.createElement('canvas');
    return window.atob && elem.getContext && elem.getContext('2d') && window.Blob;
  };

  if (upload.isResizeSupported()) {
    // add name getter to the blob constructor prototype
    Object.defineProperty(window.Blob.prototype, 'name', {
      get: function () {
        return this.$ngfName;
      },
      set: function (v) {
        this.$ngfName = v;
      },
      configurable: true
    });
  }

  upload.resize = function (file, options) {
    if (file.type.indexOf('image') !== 0) return upload.emptyPromise(file);

    var deferred = $q.defer();
    upload.dataUrl(file, true).then(function (url) {
      resize(url, options.width, options.height, options.quality, options.type || file.type,
        options.ratio, options.centerCrop, options.resizeIf)
        .then(function (dataUrl) {
          if (file.type === 'image/jpeg' && options.restoreExif !== false) {
            try {
              dataUrl = upload.restoreExif(url, dataUrl);
            } catch (e) {
              setTimeout(function () {throw e;}, 1);
            }
          }
          try {
            var blob = upload.dataUrltoBlob(dataUrl, file.name, file.size);
            deferred.resolve(blob);
          } catch (e) {
            deferred.reject(e);
          }
        }, function (r) {
          if (r === 'resizeIf') {
            deferred.resolve(file);
          }
          deferred.reject(r);
        });
    }, function (e) {
      deferred.reject(e);
    });
    return deferred.promise;
  };

  return upload;
}]);
