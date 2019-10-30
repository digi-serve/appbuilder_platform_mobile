/**
 * Wrapper class for loading animation.
 * Animation by James Duncan.
 *
 * Requires FSS and jQuery.
 */
"use strict";

export default class Loader {
    constructor(options = {}) {
        var defaults = {
            container: "backgroundAnimation",
            holder: "backgroundAnimationHolder",
            light: ["#00bcd4", "#0097a7"],
            geometry: [375, 812, 3, 6],
            autoStart: true,
            material: ["#555555", "#FFFFFF"]
        };
        options = $.extend({}, defaults, options);

        this.holder = document.getElementById(options.holder);
        if (this.holder) {
            this.container = this.holder.getElementsByClassName(
                options.container
            )[0];

            this.renderer = new FSS.SVGRenderer();
            this.light = new FSS.Light(...options.light);

            var geometry = new FSS.Plane(...options.geometry);
            var material = new FSS.Material(...options.material);
            var mesh = new FSS.Mesh(geometry, material);

            this.scene = new FSS.Scene();
            this.scene.add(mesh);
            this.scene.add(this.light);

            this.startTime = Date.now();
            // this.textInterval = null;

            // Create this.resize() method as an arrow function so that when it is
            // invoked by addEventListener, the `this` variable won't get clobbered.
            this.resize = () => {
                this.renderer.setSize(
                    this.holder.offsetWidth,
                    this.holder.offsetHeight
                );
            };

            if (options.autoStart) {
                this.start();
            }
        }
    }

    start() {
        if (this.container) {
            this.isAnimationEnabled = true;
            window.addEventListener("resize", this.resize);
            this.container.appendChild(this.renderer.element);

            this.resize();
            this.animate();
            // this.text();
        } else {
            console.error("Loader: no container found.");
        }
    }

    stop() {
        window.removeEventListener("resize", this.resize);
        // clearInterval(this.textInterval);
        this.isAnimationEnabled = false;
    }

    animate() {
        var now = Date.now() - this.startTime;
        this.light.setPosition(
            300 * Math.sin(now * 0.001),
            200 * Math.cos(now * 0.0005),
            60
        );
        this.renderer.render(this.scene);
        requestAnimationFrame(() => {
            if (this.isAnimationEnabled) this.animate();
        });
    }

    // text() {
    //     var myClass = this;
    //     $('.pane1').stop().hide();
    //     $('.pane2').stop().hide();
    //     $('.pane3').stop().hide();
    //
    //     $('.pane1').fadeTo(1000, 1, function() {
    //         if (!myClass.isAnimationEnabled) return;
    //         $('.pane1').delay(2000).fadeTo(1000, 0, function() {
    //             if (!myClass.isAnimationEnabled) return;
    //             $('.pane2').fadeTo(1000, 1, function() {
    //                 if (!myClass.isAnimationEnabled) return;
    //                 $('.pane2').delay(2000).fadeTo(1000, 0, function() {
    //                     if (!myClass.isAnimationEnabled) return;
    //                     $('.pane3').fadeTo(1000, 1, function() {
    //                         if (!myClass.isAnimationEnabled) return;
    //                         $('.pane3').delay(2000).fadeTo(1000, 0, function() {
    //                             if (!myClass.isAnimationEnabled) return;
    //                             myClass.text();
    //                         });
    //                     });
    //                 });
    //             });
    //         });
    //     });
    // }
}
