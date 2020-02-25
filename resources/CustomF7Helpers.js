import Applications from "../../applications/applications.js";

("use strict");

if (typeof Template7 == "undefined") {
    throw new Error("Template7 is required to build helpers");
}

if (typeof Applications == "undefined") {
    throw new Error("Applications is required to build helpers");
}

if (typeof moment == "undefined") {
    throw new Error("moment is required to build helpers");
}

Template7.registerHelper("print", (parent, object) => {
    return parent[object];
});
Template7.registerHelper("date", (parent, object, template) => {
    var temp = "YYYY-MM-DD";
    if (typeof template == "string") {
        temp = template;
    }
    return moment(parent[object]).format(temp);
});
Template7.registerHelper("initial", (parent, object) => {
    return parent[object].substring(0, 1);
});
Template7.registerHelper("listItem", (app, obj, item, selected) => {
    var thisApp = Applications.filter((x) => {
        return (x.id = app);
    })[0];

    // this is a sample of how we populate list options
    var list = thisApp.listItems(
        obj,
        item,
        thisApp.application.languageDefault()
    );

    var selectedItem = selected[item];

    var chosen = list.filter((p) => {
        return p.id == selectedItem;
    });
    if (chosen[0] && chosen[0].label) {
        return chosen[0].label;
    } else {
        return "";
    }
});
Template7.registerHelper("listItems", (app, obj, item, selected, template) => {
    var thisApp = Applications.filter((x) => {
        return (x.id = app);
    })[0];

    // this is a sample of how we populate list options
    var list = thisApp.listItems(
        obj,
        item,
        thisApp.application.languageDefault()
    );

    var selectedItem = selected[item];

    var chosen = list.filter((p) => {
        return p.id == selectedItem;
    })[0];

    if (list.length) {
        var html = "";
        list.forEach((l) => {
            var selectedAttr = "";
            if (chosen.id == l.id) {
                selectedAttr = "selected='selected'";
            }
            html += template
                .replace(/%label%/g, l.label)
                .replace(/%name%/g, l.name)
                .replace(/%id%/g, l.id)
                .replace(/%selected%/g, selectedAttr);
        });
        return html;
    } else {
        return [];
    }
});
Template7.registerHelper("translate", (app, parent, object) => {
    var thisApp = Applications.filter((x) => {
        return (x.id = app);
    })[0];

    var lang = thisApp.application.languageDefault();

    var translated = parent.translations.filter((f) => {
        var itemToReturn = Object.keys(f).some((key) => {
            if (key == object) {
                return f;
            }
        });
        return itemToReturn;
    });
    return translated[0][object];
});
