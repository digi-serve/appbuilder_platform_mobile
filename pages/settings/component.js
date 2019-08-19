/**
 * @class Component
 *
 * Base class for component objects. Intended to be used as the data processing
 * unit for Framework7 components.
 *
 * Is an EventEmitter.
 */
"use strict";

/* global Template7 */
import EventEmitter from "eventemitter2";
import { storage } from "../../resources/Storage.js";
import log from "../../resources/Log.js";
import analytics from "../../resources/Analytics.js";

export default class Component extends EventEmitter {
    /**
     * @param {Framework7} app
     * @param {object} [options]
     * @param {string} [options.id]
     *      The DOM ID of the component's root element.
     * @param {object} [options.templates]
     *      {
     *          <templateName>: <templatePath>,
     *          ...
     *      }
     */
    constructor(app, options = {}) {
        super({
            wildcard: true
        });

        options = options || {};

        this.app = app;
        this.storage = storage;
        this.templates = {};
        if (options.id) {
            this.id = options.id;
        }

        this.templatesReady = $.Deferred();
        this.prepareTemplates(options.templates);

        this.dataReady = $.Deferred();
        this.storage.on("ready", () => {
            this.initData()
                .then(() => {
                    this.dataReady.resolve();
                })
                .catch(log);
        });

        this.dataReady.done(() => {
            this.init();
        });
    }

    /**
     * Shortcut for this.$element.find()
     */
    $(pattern) {
        var $element;
        if (this.id) {
            $element = $("#" + this.id);
        } else {
            $element = $(document.body);
        }
        return $element.find(pattern);
    }

    /**
     * This will be called once the storage system has been initialized.
     * Override this in the child class to do the initial data loading.
     *
     * @return {Promise}
     */
    initData() {
        return new Promise((resolve) => {
            resolve();
        });
    }

    /**
     * This will be called after initData() has resolved.
     * Override this in the child class to initialize things that depend
     * on data being ready.
     */
    init() {}

    /**
     * Compiles all the given Template7 templates, then
     * resolves `this.templatesReady`.
     *
     * @param {object} templates
     *      {
     *          <name>: <template path>,
     *          ...
     *      }
     * @return {Deferred}
     */
    prepareTemplates(templates = {}) {
        var DFDs = [];

        for (var name in templates) {
            var path = templates[name];
            ((path, name) => {
                DFDs.push(
                    $.ajax({
                        url: path,
                        success: (data /* , status, xhr */) => {
                            this.templates[name] = Template7.compile(data);
                        }
                    })
                );
            })(path, name);
        }

        return $.when(...DFDs).done(() => {
            this.templatesReady.resolve();
        });
    }

    /**
     * Retrieve a value from persistent storage.
     *
     * @param {String} key
     * @param {anything} [defaultValue]
     *      Optional value to use if there was no stored value.
     * @param {function} [callback]
     *      Instead of `defaultValue` parameter, this callback function can be
     *      used to handle the stored value. `this[key]` will not be modified
     *      in this case.
     *
     * @return {Promise}
     */
    loadData(key, defaultValue = null) {
        return this.storage
            .get(key)
            .then((value) => {
                if (typeof defaultValue == "function") {
                    var callback = defaultValue;
                    callback(value);
                } else {
                    this[key] = value || defaultValue;
                }

                return value;
            })
            .catch((err) => {
                console.log("Error reading from storage: " + key);
                analytics.logError(err);

                log.alert(
                    "<t>There was a problem reading your data</t>",
                    "<t>Sorry</t>"
                );
            });
    }

    /**
     * Save a value to persistent storage.
     *
     * @param {String} key
     * @param {anything} [value]
     *      By default, the value is read from this[key].
     * @return {Promise}
     */
    saveData(key, value) {
        if (typeof value == undefined) {
            value = this[key];
            if (
                typeof value == "object" &&
                typeof value.serialize == "function"
            ) {
                value = value.serialize();
            }
        }
        return this.storage.set(key, value);
    }
}
