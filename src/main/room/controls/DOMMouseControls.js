// Copyright 2015 by Paulo Augusto Peccin. See license.txt distributed with this file.

// Only 1 Mouse supported

wmsx.DOMMouseControls = function(hub) {
"use strict";

    var self = this;

    this.connect = function(peControllersSocket) {
        controllersSocket = peControllersSocket;
    };

    this.connectPeripherals = function(pScreen) {
        screen = pScreen;
    };

    this.powerOn = function() {
    };

    this.powerOff = function() {
    };

    this.releaseControllers = function() {
        mouseState.reset();
    };

    this.resetControllers = function() {
        this.releaseControllers();
        if (mode === -1) port = -1;     // If in Auto mode, disable mouse
        updateConnectionsToHub();
    };

    this.toggleMode = function() {
        ++mode; if (mode > 1) mode = -2;
        port = mode < 0 ? -1 : mode;
        if (port < 0) mouseState.reset();

        updateConnectionsToHub();
        showStatusMessage(mode === -2 ? "Mouse DISABLED" : mode == -1 ? "Mouse AUTO" : mode === 0 ? "Mouse ENABLED" : "Mouse ENABLED (swapped)");
    };

    this.readMousePort = function(atPort) {
        if (atPort === port) return mouseState.portValue;
        else return 0x3f;
    };

    this.writeMousePin8Port = function(atPort, val) {
        if (atPort !== port) return;

        var flipped = mouseState.pin8Value ^ val;
        if (!flipped) return;

        mouseState.pin8Value = val;

        var elapsed = controllersSocket.getCPUCycles() - mouseState.lastPin8FlipCPUCycle;
        mouseState.lastPin8FlipCPUCycle += elapsed;

        // Resets read cycle if timeout passed since last flip
        if (elapsed > READ_CYCLE_RESET_TIMEOUT) mouseState.readCycle = -1;

        ++mouseState.readCycle;
        if (mouseState.readCycle === 0) updateDeltas();
        updatePortValue();

        //console.log("Mouse SET ReadCycle: " + mouseState.readCycle + ", elapsed: " + elapsed);
    };

    this.portPin8Announced = function(atPort, val) {
        if (val === 1 && port < 0 && mode === -1) tryAutoEnable(atPort, val);
    };

    this.togglePointerLock = function() {
        if (pointerLocked) unlockPointer();
        else lockPointer();
    };

    this.setMouseInputElement = function(pElement) {
        inputElement = pElement;

        // Register events needed
        if ("onpointerlockchange" in document) document.addEventListener('pointerlockchange', pointerLockChangedEvent, false);
        else if ("onmozpointerlockchange" in document) document.addEventListener('mozpointerlockchange', pointerLockChangedEvent, false);
        inputElement.addEventListener("mousemove", mouseMoveEvent);
        inputElement.addEventListener("mousedown", mouseButtonEvent);
        inputElement.addEventListener("mouseup",   mouseButtonEvent);
    };

    this.setScreenPixelScale = function(scaleX, scaleY) {
        pixelScaleX = scaleX; pixelScaleY = scaleY;
    };

    function lockPointer() {
        if (port < 0)
            return screen.showOSD("Mouse Pointer Locking only when MOUSE is ENALBED!", true, true);
        var func = inputElement.requestPointerLock || inputElement.mozRequestPointerLock || inputElement.webkitRequestPointerLock;
        if (func) func.apply(inputElement);
    }

    function unlockPointer() {
        var func = document.exitPointerLock || document.mozExitPointerLock || document.webkitExitPointerLock;
        if (func) func.apply(document);
    }

    function updatePortValue() {
        switch (mouseState.readCycle) {
            case 0:
                mouseState.portValue = (mouseState.portValue & ~0x0f) | ((mouseState.readDX >> 4) & 0xf); break;
            case 1:
                mouseState.portValue = (mouseState.portValue & ~0x0f) | (mouseState.readDX & 0xf); break;
            case 2:
                mouseState.portValue = (mouseState.portValue & ~0x0f) | ((mouseState.readDY >> 4)& 0xf); break;
            case 3:
                mouseState.portValue = (mouseState.portValue & ~0x0f) | (mouseState.readDY & 0xf); break;
            default:
                mouseState.portValue = mouseState.portValue & ~0x0f;    // Not reading movement, leave only buttons state
        }

        //console.log("Setting mouse port value: " + (mouseState.portValue & 0xf));
    }

    function updateDeltas() {
        // Calculate movement deltas, limited to the protocol range
        var dX = Math.round(-mouseState.dX);
        if (dX > 127) dX = 127; else if (dX < -127) dX = -127;
        mouseState.dX += dX;
        mouseState.readDX = dX;

        var dY = Math.round(-mouseState.dY);
        if (dY > 127) dY = 127; else if (dY < -127) dY = -127;
        mouseState.dY += dY;
        mouseState.readDY = dY;

        //if (dX !== 0 && dY !== 0) console.log("New DX: " + dX + ", DY: " + dY);
    }

    function mouseMoveEvent(e) {
        e.preventDefault();

        // Get movement either by movement reported (pointer locked) or by position (pointer unlocked)
        var dX = 0, dY = 0;
        if (pointerLocked) {
            dX = e.movementX || e.mozMovementX || e.webkitMovementX || 0;
            dY = e.movementY || e.mozMovementY || e.webkitMovementY || 0;
        } else if (lastMoveEvent) {
            dX = e.clientX - lastMoveEvent.clientX;
            dY = e.clientY - lastMoveEvent.clientY;
        }
        lastMoveEvent = e;

        mouseState.dX += dX / pixelScaleX;
        mouseState.dY += dY / pixelScaleY;

        //console.log("Mouse moved. DX: " + mouseState.dX + ", DY: " + mouseState.dY);
    }

    function mouseButtonEvent(event) {
        var lastButtons = mouseState.buttons;
        mouseState.buttons = event.buttons & 7;
        mouseState.portValue = (mouseState.portValue & ~0x30) | ((~mouseState.buttons & 3) << 4);

        if ((mouseState.buttons & 4) && !(lastButtons & 4)) self.togglePointerLock();
    }

    function pointerLockChangedEvent() {
        var lockingElement = document.pointerLockElement || document.mozPointerLockElement || document.webkitPointerLockElement;
        pointerLocked = lockingElement === inputElement;
        screen.mousePointerLocked(pointerLocked);
        screen.showOSD(pointerLocked ? "Mouse Pointer Locked" : "Mouse Pointer Released", pointerLocked);   // Only force message when Locking
    }

    function tryAutoEnable(atPort, pin8Val) {
        port = atPort;

        self.writeMousePin8Port(port, pin8Val);
        updateConnectionsToHub();

        showStatusMessage("Mouse AUTO-ENABLED");
    }

    function updateConnectionsToHub() {
        if (pointerLocked && port < 0) unlockPointer();
        hub.updateMouseConnections(port === 0 ? "MOUSE" : null, port === 1 ? "MOUSE" : null);
        screen.setMouseActiveCursor(port >= 0);
    }

    function showStatusMessage(mes) {
        hub.showStatusMessage(mes);
    }


    var mouseState = new MouseState();

    var mode = -1;                               // -1: auto, 0: enabled at port 0, 1: enabled at port 1, -2: disabled
    var port = -1;                               // -1: disconnected, 0: connected at port 0, 1: connected at port 1
    var pixelScaleX = 1, pixelScaleY = 1;

    var inputElement;
    var lastMoveEvent;
    var pointerLocked = false;

    var controllersSocket, screen;

    var READ_CYCLE_RESET_TIMEOUT = (wmsx.Z80.BASE_CLOCK / 1000 * 1.5) | 0;   // 1.5 milliseconds


    // Stores a complete Mouse state, with positions and buttons
    function MouseState() {
        this.reset = function() {
            this.dX = 0;
            this.dY = 0;
            this.buttons = 0;

            this.portValue = 0x3f;
            this.pin8Value = 0;
            this.lastPin8FlipCPUCycle = 0;
            this.readCycle = -1;
            this.readDX = 0;
            this.readDY = 0;
        };
        this.reset();
    }

};


