/**
 * Copyright (c) Haiku 2016-2018. All rights reserved.
 */

import createMixpanel from './createMixpanel';
import createRightClickMenu from './createRightClickMenu';
import getElementSize from './getElementSize';
import getLocalDomEventPosition from './getLocalDomEventPosition';
import patch from './patch';
import render from './render';

// tslint:disable-next-line:function-name
export default function HaikuDOMRenderer(config) {
  this._user = {
    mouse: {
      x: 0,
      y: 0,
      down: 0,
      buttons: [0, 0, 0], // Assume most mouses have 3 buttons?
    },
    keys: {},
    touches: [], // [{ x: 'number', y: 'number' }]
    mouches: [], // [{ x: 'number', y: 'number' }] - Both touches and mouse cursor info
  };

  this._lastContainer = undefined;

  this.config = config;
  this.shouldCreateContainer = true;
}

HaikuDOMRenderer.prototype.render = function renderWrap(domElement, virtualContainer, virtualTree, component) {
  return render(domElement, virtualContainer, virtualTree, component);
};

HaikuDOMRenderer.prototype.patch = function patchWrap(domElement, patchesDict, component) {
  return patch(domElement, patchesDict, component);
};

HaikuDOMRenderer.prototype.menuize = function menuize(domElement, component) {
  return createRightClickMenu(domElement, component);
};

HaikuDOMRenderer.prototype.mixpanel = function mixpanel(domElement, mixpanelToken, component) {
  return createMixpanel(domElement, mixpanelToken, component);
};

HaikuDOMRenderer.prototype.hasSizing = function hasSizing() {
  return this.config && this.config.options.sizing && this.config.options.sizing !== 'normal';
};

HaikuDOMRenderer.prototype.createContainer = function createContainer(domElement) {
  this._lastContainer = {
    isContainer: true,
    layout: {
      computed: {
        size: getElementSize(domElement),
      },
    },
  };

  if (!this.hasSizing() || !this.config.options.alwaysComputeSizing) {
    this.shouldCreateContainer = false;
  }

  return this._lastContainer;
};

HaikuDOMRenderer.prototype.getLastContainer = function getLastContainer() {
  return this._lastContainer;
};

HaikuDOMRenderer.prototype.initialize = function initialize(domMountElement) {
  const user = this._user;

  function setMouse(mouseEvent) {
    // Since the mount itself might be subject to sizing styles that we cannot
    // use to calculate appropriately, use the top element i.e. the 'artboard'
    const topElement = domMountElement.childNodes[0];
    if (topElement) {
      const pos = getLocalDomEventPosition(mouseEvent, topElement);
      user.mouse.x = pos.x;
      user.mouse.y = pos.y;
    }
  }

  function setTouches(touchEvent) {
    user.touches.splice(0);
    // Since the mount itself might be subject to sizing styles that we cannot
    // use to calculate appropriately, use the top element i.e. the 'artboard'
    const topElement = domMountElement.childNodes[0];
    if (topElement) {
      for (let i = 0; i < touchEvent.touches.length; i++) {
        const touch = touchEvent.touches[i];
        const pos = getLocalDomEventPosition(touch, topElement);
        user.touches.push(pos);
      }
    }
  }

  function setMouches() {
    user.mouches.splice(0);
    // Only treat a mouse like a touch if it is down.
    if (user.mouse.down) {
      user.mouches.push(user.mouse);
    }
    user.mouches.push.apply(user.mouches, user.touches);
  }

  function clearKey() {
    for (const which in user.keys) {
      user.keys[which] = 0;
    }
  }

  function clearMouse() {
    user.mouse.down = 0;
    user.touches.splice(0);
    for (let i = 0; i < user.mouse.buttons.length; i++) {
      user.mouse.buttons[i] = 0;
    }
  }

  function clearMouch() {
    user.mouches.splice(0);
  }

  function clearTouch() {
    user.touches.splice(0);
  }

  // MOUSE
  // -----

  domMountElement.addEventListener('mousedown', (mouseEvent) => {
    ++user.mouse.down;
    ++user.mouse.buttons[mouseEvent.button];
    setMouse(mouseEvent);
    setMouches();
  });

  domMountElement.addEventListener('mouseup', (mouseEvent) => {
    clearMouse();
    clearMouch();
    setMouches();
  });

  domMountElement.addEventListener('mousemove', (mouseEvent) => {
    setMouse(mouseEvent);
    setMouches();
  });

  domMountElement.addEventListener('mouseenter', (mouseEvent) => {
    clearMouse();
    clearMouch();
  });

  domMountElement.addEventListener('mouseleave', (mouseEvent) => {
    clearMouse();
    clearMouch();
  });

  domMountElement.addEventListener(
    'wheel',
    (mouseEvent) => {
      setMouse(mouseEvent);
      setMouches();
    },
    {
      passive: true, // Avoid perf warnings. TODO: Make configurable
    },
  );

  const doc = domMountElement.ownerDocument;
  const win = doc.defaultView || doc.parentWindow;

  // KEYS
  // ----

  doc.addEventListener('keydown', (keyEvent) => {
    if (user.keys[keyEvent.which] === undefined) {
      user.keys[keyEvent.which] = 0;
    }
    ++user.keys[keyEvent.which];
  });

  doc.addEventListener('keyup', (keyEvent) => {
    if (user.keys[keyEvent.which] === undefined) {
      user.keys[keyEvent.which] = 0;
    }

    // Known Mac "feature" where keyup never fires while meta key (91) is down
    // When right-click menu is toggled we don't get all mouseup events
    if (keyEvent.which === 91 || keyEvent.which === 17) {
      clearKey();
    }

    user.keys[keyEvent.which] = 0;
  });

  // WINDOW

  // If there's any sizing mode that requires computation of container size and alwaysComputeSizing is *disabled*, make
  // an "overiding" assumption that we probably want to recompute the container when media queries change.
  if (this.hasSizing() && !this.config.options.alwaysComputeSizing) {
    win.addEventListener('resize', () => {
      this.shouldCreateContainer = true;
    });

    win.addEventListener('orientationchange', () => {
      this.shouldCreateContainer = true;
    });
  }

  win.addEventListener('blur', (blurEvent) => {
    clearKey();
    clearMouse();
    clearTouch();
    clearMouch();
  });

  win.addEventListener('focus', (blurEvent) => {
    clearKey();
    clearMouse();
    clearTouch();
    clearMouch();
  });

  // TOUCHES
  // -------
  domMountElement.addEventListener(
    'touchstart',
    (touchEvent) => {
      setTouches(touchEvent);
      setMouches();
    },
    {
      passive: true, // Avoid perf warnings. TODO: Make configurable
    },
  );

  domMountElement.addEventListener('touchend', (touchEvent) => {
    clearTouch();
    clearMouch();
  });

  domMountElement.addEventListener(
    'touchmove',
    (touchEvent) => {
      setTouches(touchEvent);
      setMouches();
    },
    {
      passive: true, // Avoid perf warnings. TODO: Make configurable
    },
  );

  domMountElement.addEventListener('touchenter', (touchEvent) => {
    clearTouch();
    clearMouch();
  });

  domMountElement.addEventListener('touchleave', (touchEvent) => {
    clearTouch();
    clearMouch();
  });
};

HaikuDOMRenderer.prototype.removeListener = function removeListener(target, handler, eventName) {
  target.removeEventListener(eventName, handler);
  return this;
};

HaikuDOMRenderer.prototype.getUser = function getUser() {
  return {
    mouse: {
      x: this._user.mouse.x,
      y: this._user.mouse.y,
      down: this._user.mouse.down,
      buttons: [...this._user.mouse.buttons],
    },
    keys: {...this._user.keys},
    touches: [...this._user.touches],
    mouches: [...this._user.mouches],
  };
};
