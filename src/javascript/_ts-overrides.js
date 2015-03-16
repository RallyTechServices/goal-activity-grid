Ext.override(Rally.ui.picker.FieldPicker, {
    alwaysSelectedValues: ['Name','FormattedID'],
    _shouldShowField: function(field) {
      //  var allowed_attribute_types = ['STATE','STRING'];
        if (field.attributeDefinition){
            var attr_def = field.attributeDefinition;
            return (!Ext.Array.contains(this.fieldBlackList,field.name) &&
                    attr_def.Hidden == false && attr_def.ReadOnly == false)
        }
        return false;
    }
});
