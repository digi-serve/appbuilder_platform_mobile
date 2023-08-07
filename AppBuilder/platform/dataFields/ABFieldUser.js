/**
 * ABFieldUser
 *
 * This is the platform dependent implementation of ABFieldUser.
 *
 */

var ABFieldUserCore = require("../../core/dataFields/ABFieldUserCore");

module.exports = class ABFieldUser extends ABFieldUserCore {
   // Make this platform specific:
   // to be honest, might not even be applicable here on a mobile device:
   getUsers() {
      console.error(
         "!!! Whoah!  ABFieldUser.getUsers() called.  Who is doing this?"
      );
      return [];
      // return OP.User.userlist().map((u) => {
      // 	var result = {
      // 		id: u.username
      // 	};

      // 	if (this.settings.isMultiple) {
      // 		result.text = u.username;
      // 	}
      // 	else {
      // 		result.value = u.username;
      // 	}

      // 	return result;
      // });
   }
};
