/**
 * ABApplication
 * 
 * This is the platform dependent implementation of ABApplication.
 *
 */

// var ABApplicationBase = require(path.join(__dirname,  "..", "..", "assets", "opstools", "AppBuilder", "classes",  "ABApplicationBase.js"));
import ABApplicationCore from "../core/AB2ApplicationCore"
import ABDataCollectionCore from "../core/ABDataCollectionCore"
import ABObjectCore from "../core/ABObjectCore"
import uuidv4 from 'uuid/v4'

import QueueLock from './ABQueueLock'

import ABDefinitions from "../ABDefinitions"

module.exports =  class ABApplication extends ABApplicationCore {

    constructor() {
    	super(ABDefinitions);


      this.Lock = QueueLock;
      
    	// Let the Relay System know we want notifications for
    	// our datacollections:

    	AB.Comm.Relay.on(ABDataCollectionCore.contextKey(), (context, data) => {

        // find the DC this update if for
        var dc = this.findDC(context.id);
        if (!dc) return;

console.log();
console.log('-----------');
console.log(':: ABApplication.Relay.on:'+ ABDataCollectionCore.contextKey());
console.log(':: context:', context);
console.log(':: data:', data);

        dc.remoteUpdate(data);

      });


      AB.Comm.Relay.on(ABObjectCore.contextKey(), (context, data) => {

  			// find the Object this update is for
  			var obj = this.objects((o)=>{return o.id == context.id})[0];
  			if (!obj) return;

console.log();
console.log('-----------');
console.log(':: ABApplication.Relay.on:'+ ABObjectCore.contextKey());
console.log(':: context:', context);
console.log(':: data:', data);
console.log(':: found obj:', obj);

        obj.remoteData(context, data);
        
      });
  	}


//// TODO: since this fn() does not depend on any platform definitions,
////       move it to the AB2ApplicationCore.js
  	findDC(id) {
  		var foundDC = null;
  		var indx = 0;
  		while( !foundDC && (indx < this._pages.length)) {
  			var page = this._pages[indx];
  			var dc = page.dataCollections((d)=>{return d.id == id;})[0];
  			if (dc) foundDC = dc;
  			indx++;
  		}
  		return foundDC;
  	}

  	cloneDeep(obj) {
  		// lodash is available on the platform
  		return _.cloneDeep(obj);
  	}


  	languageDefault() {
  		var lang = navigator.language || 'en';
  		if (lang.indexOf("en-") != -1) lang = 'en';
        if (lang.indexOf("zh-") != -1) lang = 'zh-hans'; // show one version of Chinese for all 
        if (lang.indexOf("ko-") != -1) lang = 'zh-hans'; // show Chinese instead of Korean
  		return lang;
  	}


  	uuid() {
  		return uuidv4();
  	}
}
