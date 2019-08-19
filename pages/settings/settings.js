/**
 * @class SettingsComponent
 *
 * Manages the data processing for the Settings component.
 * This is a component of the AppPage.
 */
"use strict";

import account from "../../resources/Account.js";
import analytics from "../../resources/Analytics.js";
import Component from "./component.js";
import Log from "../../resources/Log.js";
import qrPage from "../qrScanner/qrScanner.js";
import updater from "../../resources/Updater.js";

// import relay from "../../relay.js";

export default class SettingsComponent extends Component {
    /**
     * @param {Framework7} app
     */
    constructor(app) {
        super(app, {
            id: "settings-page",
            templates: {
                updateInfo: "lib/platform/pages/settings/update-info.html"
                // vpnData: "lib/app/templates/vpn-data.html"
            }
        });

        this.isUpdateReady = false;
        this.appInfo = null;
        this.qrScannerStatus = {};
        this.qrScanAttempted = "no";
        this.pfsBackupDate = null;
        this.appInfo = null;

        updater.on("installed", () => {
            this.isUpdateReady = true;
        });
    }

    initData() {
        return Promise.all([
            this.loadData("qrScanAttempted", "no"),
            this.loadData("pfsBackupDate", null),
            // CodePush app info
            this.loadData("appInfo", null)
        ]);
    }

    init() {
        // CodePush events
        updater.on("downloadStart", () => {
            this.$(".settings-update-card").hide();
            this.$("#update-progress").show();
            this.app.progressbar.set("#update-progress .progressbar", 0);
        });
        updater.on("downloading", (percentage) => {
            this.$(".settings-update").hide();
            this.$("#update-progress").show();
            this.app.progressbar.set(
                "#update-progress .progressbar",
                percentage
            );
        });
        updater.on("installing", () => {
            this.$(".settings-update-card").hide();
            this.$("#update-installing").show();
        });
        updater.on("installed", () => {
            this.$(".settings-update-card").hide();
            this.$("#update-ready").show();
        });
        updater.on("info", (info) => {
            this.saveData("appInfo", info);
            this.appInfo = info;
            this.renderPackageInfo();
        });

        // QR code scanner
        qrPage.on("cancel", () => {
            qrPage.hide();
        });
        qrPage.on("error", (err) => {
            qrPage.hide();
            Log.alert("<t>Unable to access camera</t>", "<t>Error</t>");
            analytics.logError(err);
            this.$("#qr-scan-warning").show();
        });
        qrPage.on("scan", (text) => {
            qrPage.hide();
            this.$("#qr-scan-warning").hide();

            account.importSettings(text);
        });
    }

    /**
     * @return {boolean}
     */
    wasQrScanAttempted() {
        return window.QRScanner && this.qrScanAttempted == "yes";
    }

    /**
     * Open the QR Code Scanner page.
     */
    showQrPage() {
        this.qrScanAttempted = "yes";
        this.saveData("qrScanAttempted", "yes");
        analytics.event("QR scan");
        qrPage.show();
    }

    // The AppPage controller will pass in a reference to the PFS object
    // setPFS(pfs) {
    //     this.pfs = pfs;
    // }

    /**
     * Render the App Info card
     * See update-info.html
     */
    renderPackageInfo() {
        if (this.appInfo) {
            this.$("#update-info .card-content").html(
                this.templates.updateInfo(this.appInfo)
            );
        }
    }

    /**
     * Render the "VPN Data" card
     * See vpn-data.html
     *
     * DEPRECATED
     */
    // renderVpnDataCard() {
    //     var isBackupFresh = false;

    //     this.isPFSBackupFresh()
    //         .then((isFresh) => {
    //             isBackupFresh = isFresh;
    //             return relay.getState();
    //         })
    //         .then((state) => {
    //             var backupDate, status;

    //             if (!isBackupFresh) {
    //                 status = "data has changed";
    //             } else if (state.dataPending) {
    //                 status = "backup is pending";
    //             } else {
    //                 status = "synced";
    //             }

    //             if (this.pfsBackupDate) {
    //                 backupDate = moment(this.pfsBackupDate).format(
    //                     "YYYY-MM-DD"
    //                 );
    //             } else {
    //                 backupDate = "never";
    //             }

    //             this.$("#vpn-data").html(
    //                 this.templates.vpnData({
    //                     lastBackup: backupDate,
    //                     status: status,
    //                     showBackupButton: !isBackupFresh
    //                 })
    //             );

    //             this.$("#vpn-data button").on("click", (ev) => {
    //                 this.$(ev.target).hide();
    //                 this.backupPFS();
    //             });
    //         })
    //         .catch((err) => {
    //             Log(err);
    //         });
    // }

    /**
     * Check if the PFS backup is up to date.
     *
     * @return {Promise}
     *      Resolves with boolean.
     */
    // isPFSBackupFresh() {
    //     return new Promise((resolve, reject) => {
    //         //
    //         var pfs = this.pfs;
    //         // var pfsData = pfs.serialize();
    //         var pfsHash = pfs.hash();
    //         var isBackupFresh = false;

    //         // Compare the SHA256 hash of the data
    //         this.loadData("pfsBackupHash")
    //             .then((backedUpHash) => {
    //                 if (pfsHash == backedUpHash) {
    //                     isBackupFresh = true;
    //                 }

    //                 resolve(isBackupFresh);
    //             })
    //             .catch((err) => {
    //                 reject(err);
    //             });
    //     });
    // }

    /**
     * Send PFS data to the VPN via secure relay.
     *
     * DEPRECATED
     *
     * @return {Promise}
     */
    // backupPFS() {
    //     return new Promise((resolve, reject) => {
    //         var pfs = this.pfs;
    //         var pfsData = pfs.serialize();
    //         var pfsHash = pfs.hash();
    //         var now = Date.now();

    //         relay
    //             .queue({ pfsData: pfsData, timestamp: now })
    //             .then(() => {
    //                 // Save SHA256 hash of the backup, so we can compare it later
    //                 return this.saveData("pfsBackupHash", pfsHash);
    //             })
    //             .then(() => {
    //                 this.pfsBackupDate = now;
    //                 return this.saveData("pfsBackupDate");
    //             })
    //             .then(() => {
    //                 return relay.sync();
    //             })
    //             .then(() => {
    //                 resolve();
    //             })
    //             .catch((err) => {
    //                 Log(err);
    //                 reject(err);
    //             });
    //     });
    // }
}
