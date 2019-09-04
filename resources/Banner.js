/**
 * Wrapper class for banner animation.
 * Animation by James Duncan.
 *
 * Requires FSS and jQuery.
 */
"use strict";
import Loader from "./Loader";

export default class Banner extends Loader {
    constructor(options = {}) {
        super(options);

        this.textInterval = null;
    }

    start() {
        super.start();
        this.text();
    }

    stop() {
        super.stop();
        clearInterval(this.textInterval);
    }

    // animate() {
    //     var now = Date.now() - this.startTime;
    //     this.light.setPosition(
    //         300*Math.sin(now*0.001),
    //         200*Math.cos(now*0.0005),
    //         60
    //     );
    //     this.renderer.render(this.scene);
    //     requestAnimationFrame(() => {
    //         if (this.isAnimationEnabled) this.animate();
    //     });
    // }

    text() {
        var myClass = this;
        $(".pane1")
            .stop()
            .hide();
        $(".pane2")
            .stop()
            .hide();
        $(".pane3")
            .stop()
            .hide();

        $(".pane1").fadeTo(1000, 1, function() {
            if (!myClass.isAnimationEnabled) return;
            $(".pane1")
                .delay(2000)
                .fadeTo(1000, 0, function() {
                    if (!myClass.isAnimationEnabled) return;
                    $(".pane2").fadeTo(1000, 1, function() {
                        if (!myClass.isAnimationEnabled) return;
                        $(".pane2")
                            .delay(2000)
                            .fadeTo(1000, 0, function() {
                                if (!myClass.isAnimationEnabled) return;
                                $(".pane3").fadeTo(1000, 1, function() {
                                    if (!myClass.isAnimationEnabled) return;
                                    $(".pane3")
                                        .delay(2000)
                                        .fadeTo(1000, 0, function() {
                                            if (!myClass.isAnimationEnabled)
                                                return;
                                            myClass.text();
                                        });
                                });
                            });
                    });
                });
        });
    }
}
