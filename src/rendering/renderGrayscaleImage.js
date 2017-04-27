/**
 * This module is responsible for drawing a grayscale image
 */
import { generateLut } from '../internal/generateLut.js';
import { storedPixelDataToCanvasImageData } from '../internal/storedPixelDataToCanvasImageData';
import { setToPixelCoordinateSystem } from '../setToPixelCoordinateSystem';

function initializeGrayscaleRenderCanvas(enabledElement, image)
{
    var grayscaleRenderCanvas = enabledElement.renderingTools.grayscaleRenderCanvas;
    // Resize the canvas
    grayscaleRenderCanvas.width = image.width;
    grayscaleRenderCanvas.height = image.height;

    // NOTE - we need to fill the render canvas with white pixels since we control the luminance
    // using the alpha channel to improve rendering performance.
    var grayscaleRenderCanvasContext = grayscaleRenderCanvas.getContext('2d');
    grayscaleRenderCanvasContext.fillStyle = 'white';
    grayscaleRenderCanvasContext.fillRect(0,0, grayscaleRenderCanvas.width, grayscaleRenderCanvas.height);
    var grayscaleRenderCanvasData = grayscaleRenderCanvasContext.getImageData(0,0,image.width, image.height);
    
    enabledElement.renderingTools.grayscaleRenderCanvasContext = grayscaleRenderCanvasContext;
    enabledElement.renderingTools.grayscaleRenderCanvasData = grayscaleRenderCanvasData;
}

function lutMatches(a, b) {
  // if undefined, they are equal
  if(!a && !b) {
    return true;
  }
  // if one is undefined, not equal
  if(!a || !b) {
    return false;
  }
  // check the unique ids
  return (a.id === b.id)
}

function getLut(image, viewport, invalidated)
{
    // if we have a cached lut and it has the right values, return it immediately
     if(image.cachedLut !== undefined &&
        image.cachedLut.windowCenter === viewport.voi.windowCenter &&
        image.cachedLut.windowWidth === viewport.voi.windowWidth &&
        lutMatches(image.cachedLut.modalityLUT, viewport.modalityLUT) &&
        lutMatches(image.cachedLut.voiLUT, viewport.voiLUT) &&
        image.cachedLut.invert === viewport.invert &&
        invalidated !== true) {
        return image.cachedLut.lutArray;
    }

    // lut is invalid or not present, regenerate it and cache it
    cornerstone.generateLut(image, viewport.voi.windowWidth, viewport.voi.windowCenter, viewport.invert, viewport.modalityLUT, viewport.voiLUT);
    image.cachedLut.windowWidth = viewport.voi.windowWidth;
    image.cachedLut.windowCenter = viewport.voi.windowCenter;
    image.cachedLut.invert = viewport.invert;
    image.cachedLut.voiLUT = viewport.voiLUT;
    image.cachedLut.modalityLUT = viewport.modalityLUT;
    return image.cachedLut.lutArray;
}

function doesImageNeedToBeRendered(enabledElement, image)
{
    var lastRenderedImageId = enabledElement.renderingTools.lastRenderedImageId;
    var lastRenderedViewport = enabledElement.renderingTools.lastRenderedViewport;
    
    if(image.imageId !== lastRenderedImageId ||
        lastRenderedViewport.windowCenter !== enabledElement.viewport.voi.windowCenter ||
        lastRenderedViewport.windowWidth !== enabledElement.viewport.voi.windowWidth ||
        lastRenderedViewport.invert !== enabledElement.viewport.invert ||
        lastRenderedViewport.rotation !== enabledElement.viewport.rotation ||
        lastRenderedViewport.hflip !== enabledElement.viewport.hflip ||
        lastRenderedViewport.vflip !== enabledElement.viewport.vflip ||
        lastRenderedViewport.modalityLUT !== enabledElement.viewport.modalityLUT ||
        lastRenderedViewport.voiLUT !== enabledElement.viewport.voiLUT
        )
    {
        return true;
    }

    return false;
}

function getRenderCanvas(enabledElement, image, invalidated)
{
    if (!enabledElement.renderingTools.grayscaleRenderCanvas) {
        enabledElement.renderingTools.grayscaleRenderCanvas = document.createElement('canvas');
    }

    var grayscaleRenderCanvas = enabledElement.renderingTools.grayscaleRenderCanvas;
    
    // apply the lut to the stored pixel data onto the render canvas

    if(doesImageNeedToBeRendered(enabledElement, image) === false && invalidated !== true) {
        return grayscaleRenderCanvas;
    }

    // If our render canvas does not match the size of this image reset it
    // NOTE: This might be inefficient if we are updating multiple images of different
    // sizes frequently.
    if(grayscaleRenderCanvas.width !== image.width || grayscaleRenderCanvas.height !== image.height) {
        initializeGrayscaleRenderCanvas(enabledElement, image);
    }

    // get the lut to use
    var start = (window.performance ? performance.now() : Date.now());
    var lut = getLut(image, enabledElement.viewport, invalidated);
    image.stats.lastLutGenerateTime = (window.performance ? performance.now() : Date.now()) - start;
    
    var grayscaleRenderCanvasData = enabledElement.renderingTools.grayscaleRenderCanvasData;
    var grayscaleRenderCanvasContext = enabledElement.renderingTools.grayscaleRenderCanvasContext;
    // gray scale image - apply the lut and put the resulting image onto the render canvas
    cornerstone.storedPixelDataToCanvasImageData(image, lut, grayscaleRenderCanvasData.data);

    start = (window.performance ? performance.now() : Date.now());
    grayscaleRenderCanvasContext.putImageData(grayscaleRenderCanvasData, 0, 0);
    image.stats.lastPutImageDataTime = (window.performance ? performance.now() : Date.now()) - start;

    return grayscaleRenderCanvas;
}

/**
 * API function to draw a grayscale image to a given enabledElement
 * @param enabledElement
 * @param invalidated - true if pixel data has been invaldiated and cached rendering should not be used
 */
export function renderGrayscaleImage(enabledElement, invalidated) {
    if (enabledElement === undefined) {
        throw "drawImage: enabledElement parameter must not be undefined";
    }

    var image = enabledElement.image;
    if (image === undefined) {
        throw "drawImage: image must be loaded before it can be drawn";
    }

    // get the canvas context and reset the transform
    var context = enabledElement.canvas.getContext('2d');
    context.setTransform(1, 0, 0, 1, 0, 0);

    // clear the canvas
    context.fillStyle = 'black';
    context.fillRect(0,0, enabledElement.canvas.width, enabledElement.canvas.height);

    // turn off image smooth/interpolation if pixelReplication is set in the viewport
    if(enabledElement.viewport.pixelReplication === true) {
        context.imageSmoothingEnabled = false;
        context.mozImageSmoothingEnabled = false; // firefox doesn't support imageSmoothingEnabled yet
    }
    else {
        context.imageSmoothingEnabled = true;
        context.mozImageSmoothingEnabled = true;
    }

    // Save the canvas context state and apply the viewport properties
    cornerstone.setToPixelCoordinateSystem(enabledElement, context);

    if (!enabledElement.renderingTools) {
        enabledElement.renderingTools = {};
    }

    var renderCanvas;
    if (enabledElement.options && enabledElement.options.renderer &&
        enabledElement.options.renderer.toLowerCase() === 'webgl') {
        // If this enabled element has the option set for WebGL, we should
        // user it as our renderer.
        renderCanvas = cornerstone.webGL.renderer.render(enabledElement);
    } else {
        // If no options are set we will retrieve the renderCanvas through the
        // normal Canvas rendering path
        renderCanvas = getRenderCanvas(enabledElement, image, invalidated);
    }

    // Draw the render canvas half the image size (because we set origin to the middle of the canvas above)
    context.drawImage(renderCanvas, 0,0, image.width, image.height, 0, 0, image.width, image.height);

    enabledElement.renderingTools.lastRenderedImageId = image.imageId;
    var lastRenderedViewport = {};
    lastRenderedViewport.windowCenter = enabledElement.viewport.voi.windowCenter;
    lastRenderedViewport.windowWidth = enabledElement.viewport.voi.windowWidth;
    lastRenderedViewport.invert = enabledElement.viewport.invert;
    lastRenderedViewport.rotation = enabledElement.viewport.rotation;
    lastRenderedViewport.hflip = enabledElement.viewport.hflip;
    lastRenderedViewport.vflip = enabledElement.viewport.vflip;
    lastRenderedViewport.modalityLUT = enabledElement.viewport.modalityLUT;
    lastRenderedViewport.voiLUT = enabledElement.viewport.voiLUT;
    enabledElement.renderingTools.lastRenderedViewport = lastRenderedViewport;
}
