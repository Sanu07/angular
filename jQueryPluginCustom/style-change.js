(function ($) {
 
    $.fn.changeColor = function( options ) {
 
         // override the default css with the options value
        var settings = $.extend({
            color: "#556b2f",
            backgroundColor: "yellow"
        }, options );
     
         // returning this (like builder pattern) will help in chaining more jQuery functions
        return this.css({
            color: settings.color,
            backgroundColor: settings.backgroundColor
        });
    };
 
}(jQuery));