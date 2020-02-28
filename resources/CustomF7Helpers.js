import Applications from "../../applications/applications.js";

("use strict");

// Template7 is required
if (typeof Template7 == "undefined") {
    throw new Error("Template7 is required to build helpers");
}

// Applications is required...imported above
if (typeof Applications == "undefined") {
    throw new Error("Applications is required to build helpers");
}

// moment is required
if (typeof moment == "undefined") {
    throw new Error("moment is required to build helpers");
}

// Helper to display object properties that have two or more word names
// ex: {{print parent 'object'}}
Template7.registerHelper("print", (parent, object, alternateObject) => {
    var result = parent[object] ? parent[object] : parent[alternateObject];
    return typeof result != "undefined" ? result : "";
});

// Helper to format date string into usable date Information
// default format is "YYYY-MM-DD"
// ex: {{date parent 'object'}} outputs YYYY-MM-DD of the date passed
// ex: {{date parent 'object' 'MM-DD-YYYY'}} outputs MM-DD-YYYY of the date passed
Template7.registerHelper("date", (parent, object, template) => {
    var temp = "YYYY-MM-DD";
    if (typeof template == "string") {
        temp = template;
    }
    return moment(parent[object]).format(temp);
});

// Helper to get the first letter of a name/word
// ex: {{initial parent 'object'}}
Template7.registerHelper("initial", (parent, object, alternateObject) => {
    var result = parent[object]
        ? parent[object].substring(0, 1)
        : parent[alternateObject].substring(0, 1);
    return typeof result != "undefined" ? result : "";
});

// Helper to get the translated value of a field that was a select list
// ex: {{listItem 'app' 'obj' 'item' selected}}
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

// Helper to return HTML of a list of items from a field that was a select list
// ex: {{listItems 'app' 'obj' 'item' selected '<option %selected% value="%id%">%label%</option>'}}
// %selected% will return selected='selected' if you are using this in a select input
// %label% will return the translated label of the option
// %id% will return the id/value of the option
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
