Ext.define('Rally.technicalservices.ArtifactAncestorModel',{
    extend: 'Ext.data.Model',
    fields: [
             {name: 'AncestorFormattedID',  type: 'string'},
             {name: 'AncestorName', type: 'string'},
             {name: 'FormattedID', type: 'string'},
             {name: 'Name', type: 'string'},
             {name: 'Owner', type: 'string'}
         ],
});
