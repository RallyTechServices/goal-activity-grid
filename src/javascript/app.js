Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    items: [
        {xtype: 'container', itemId: 'settings_box'},
        {xtype: 'container', itemId: 'selector_box', padding: 15, layout: {type: 'hbox'}},
        {xtype: 'container', itemId: 'display_box', padding: 15},
        {xtype: 'tsinfolink'}
    ],
    title: 'Goal Activity by Project',
    exportHash: {
        FormattedID: 'Formatted ID',
        Name: 'Name',
        p1AncestorFormattedID: 'Goal ID',
        p1AncestorName: 'Goal Name',
        p2AncestorFormattedID: 'Investment ID',
        p2AncestorName: 'Investment Name'
    },
    p2AncestorType: 'Investment',
    p1AncestorTypePath: 'PortfolioItem/Goal',
    p2AncestorTypePath: 'PortfolioItem/Investment',
    p1AncestorHash: {},
    p2AncestorHash: {},
    displayFieldHash: {},
    alwaysSelectedFields: ['FormattedID','Name'],
    launch: function () {
        if (this.isExternal()){
            this.showSettings(this.config);
        } else {
            this.onSettingsUpdate(this.getSettings());  //(this.config.type,this.config.pageSize,this.config.fetch,this.config.columns);
        }
    },
    _initializeApp: function (additionalFields) {
        var promises = [];
        this.additionalFields = additionalFields;
        promises.push(this._fetchPortfolioItemHash(this.p1AncestorTypePath));
        promises.push(this._fetchPortfolioItemHash(this.p2AncestorTypePath));
        promises.push(this._getDisplayNameMapping(additionalFields));
        Deft.Promise.all(promises).then({
            scope: this,
            success: function (hashes) {
                this.logger.log('_fetchPortfolioItemHash x 2', hashes);
                this.p1AncestorHash = hashes[0];
                this.p2AncestorHash = hashes[1];
                this.displayFieldMapping = hashes[2];
                this.logger.log('initializeApp',this.p1AncestorHash, this.p2AncestorHash, this.displayFieldMapping);
                this._addIterationSelector();
            }
        });
    },
    _getDisplayNameMapping: function(fieldArray){
        var deferred = Ext.create('Deft.Deferred');

        Rally.data.ModelFactory.getModel({
            type: 'UserStory',
            success: function(model) {
                var displayFieldMapping = {};
                var defectFields = [];
                var fields = model.getFields();
                Ext.each(fieldArray, function(f){
                    var field = model.getField(f);
                    if (field){
                        displayFieldMapping[f] = field.displayName;
                    } else {
                        displayFieldMapping[f] = f;
                        defectFields.push(f);
                    }
                });

                if (defectFields.length > 0 ){
                    Rally.data.ModelFactory.getModel({
                        type: 'Defect',
                        success: function(model){
                            Ext.each(defectFields, function(df){
                                var field = model.getField(df);
                                if (field){
                                    displayFieldMapping[df] = field.displayName;
                                }
                            });
                            deferred.resolve(displayFieldMapping);
                        }
                    });
                } else {
                    deferred.resolve(displayFieldMapping);
                }
            }
        });


        return deferred;
     },
    _addIterationSelector: function () {

        var prj = this.getContext().getProjectRef();
        //This will only show iterations for the current project.  
        this.down('#selector_box').add({
            xtype: 'rallyiterationcombobox',
            itemId: 'cb-iteration',
            fieldLabel: 'Iteration',
            width: 300,
            margin: 10,
            labelAlign: 'right',
            storeConfig: {
                context: {
                    project: this.getContext().getProjectRef(),
                    projectScopeDown: false,
                    projectScopeUp: false
                }
            },
            allowNoEntry: true,
            listeners: {
                scope: this,
                select: this._prepareGridData,
                ready: this._prepareGridData
            }
        });

        this.down('#selector_box').add({
            xtype: 'rallybutton',
            text: 'Export',
            scope: this,
            margin: 10,
            handler: this._export
        });
    },
    _export: function () {
        if (this.exportData) {
            this.logger.log('_export', this.exportHash);
            var text = Rally.technicalservices.FileUtilities.convertDataArrayToCSVText(this.exportData, this.exportHash);
            Rally.technicalservices.FileUtilities.saveTextAsFile(text, 'goal-activity.csv');
        }
    },
    _fetchIterations: function (iterationName) {
        var deferred = Ext.create('Deft.Deferred');
        Ext.create('Rally.data.wsapi.Store', {
            autoLoad: true,
            model: 'Iteration',
            fetch: ['Name', 'ObjectID'],
            filters: [{
                property: 'Name',
                value: iterationName
            }],
            context: {
                project: this.getContext().getProjectRef(),
                projectScopeDown: this.getContext().getProjectScopeDown(),
                projectScopeUp: false
            },
            listeners: {
                scope: this,
                load: function (store, records, success) {
                    this.logger.log('_fetchIterations', records);
                    deferred.resolve(records);
                }
            }
        });
        return deferred;
    },
    _prepareGridData: function (iterationCombobox) {
        //First, if the project is scoped down, we need to get all matching iterations.  
        if (this.down('#grd')) {
            this.down('#grd').destroy();
        }


        var iterations = [];
        var rec = iterationCombobox.getRecord();
        this.logger.log('_prepareGridData', rec);
        if (rec) {
            this.setLoading(true);
            if (this.getContext().getProjectScopeDown()) {
                var iteration_name = rec.get('Name');
                this._fetchIterations(iteration_name).then({
                    scope: this,
                    success: function (iterationRecords) {
                        this.logger.log('_prepareGridData success (iterations)', iterationRecords.length);
                        Ext.each(iterationRecords, function (irec) {
                            iterations.push(irec.get('ObjectID'));
                        });
                        this._fetchArtifacts(iterations).then({
                            scope: this,
                            success: function (artifactRecords) {
                                this.logger.log('_prepareGridData success (artifacts)', artifactRecords.length);
                                var artifact_store = this._mungeArtifactRecords(artifactRecords);
                                this._buildGrid(artifact_store);
                                this.setLoading(false);
                            }
                        });
                    }
                });
            } else {
                iterations.push(rec.get('ObjectID'));
                this._fetchArtifacts(iterations).then({
                    scope: this,
                    success: function (artifactRecords) {
                        this.logger.log('_prepareGridData success (artifacts)', artifactRecords.length);
                        var artifact_store = this._mungeArtifactRecords(artifactRecords);
                        this._buildGrid(artifact_store);
                        this.setLoading(false);
                    }
                });
            }
        }

    },
    _mungeArtifactRecords: function (artifactRecords) {
        this.logger.log('_mungeArtifactRecords');

        var p1Ancestors = this.p1AncestorHash;
        var p1AncestorKeys = _.map(_.keys(p1Ancestors), function (oid) {
            return Number(oid)
        });
        var p2Ancestors = this.p2AncestorHash;
        var p2AncestorKeys = _.map(_.keys(p2Ancestors), function (oid) {
            return Number(oid)
        });
        var p2AncestorType = this.p2AncestorType;
        this.logger.log('_mungeArtifactRecords', p1AncestorKeys, p2AncestorKeys);
        var data = [];
        console.log(_.keys(p1Ancestors));
        Ext.each(artifactRecords, function (rec) {
            var p1AncestorOid = _.intersection(p1AncestorKeys, rec.get('_ItemHierarchy'))[0] || null;
            var p1AncestorFid = null, p1AncestorName = null;
            var p2AncestorOid = _.intersection(p2AncestorKeys, rec.get('_ItemHierarchy'))[0] || null;
            var p2AncestorFid = null, p2AncestorName = null;
            var p1Ref = null;
            var p2Ref = null;

            this.logger.log('_mungeAritfactRecords ancestors', p1AncestorOid, p2AncestorOid);
            if (p1AncestorOid > 0) {
                p1AncestorFid = p1Ancestors[p1AncestorOid].FormattedID;
                p1AncestorName = p1Ancestors[p1AncestorOid].Name;
                p1Ref = Ext.String.format('/{0}/{1}', this.p1AncestorTypePath.toLowerCase(), p1AncestorOid);
                this.logger.log('p1 ancestor', p1Ref, p1AncestorFid, p1AncestorName);
            }

            if (p2AncestorOid) {
                p2AncestorFid = p2Ancestors[p2AncestorOid].FormattedID;
                p2AncestorName = p2Ancestors[p2AncestorOid].Name;
                p2Ref = Ext.String.format('/{0}/{1}', this.p2AncestorTypePath.toLowerCase(), p2AncestorOid);
                this.logger.log('p2 ancestor', p2Ref, p2AncestorFid);
            }

            var ref_string = Ext.String.format('/{0}/{1}', rec.get('_TypeHierarchy').slice(-1)[0], rec.get('ObjectID'));
            var munged_rec = {
                FormattedID: rec.get('FormattedID'),
                Name: rec.get('Name'),
                _ref: ref_string,
                p1AncestorFormattedID: p1AncestorFid,
                p1AncestorName: p1AncestorName,
                p1AncestorOid: p1AncestorOid,
                p1AncestorRef: p1Ref,
                p2AncestorFormattedID: p2AncestorFid,
                p2AncestorName: p2AncestorName,
                p2AncestorOid: p2AncestorOid,
                p2AncestorRef: p2Ref

            };
            Ext.each(this._getAdditionalFields(), function (f) {
                munged_rec[f] = rec.get(f);
            });
            data.push(munged_rec);
        }, this);
        this.logger.log('_mungeArtifactRecords data', data);
        this.exportData = data;

        return Ext.create('Rally.data.custom.Store', {
            data: data,
            groupField: 'p2AncestorFormattedID',
            groupDir: 'ASC',
            pageSize: 200,
            getGroupString: function (record) {
                var fid = record.get('p2AncestorFormattedID');
                var name = record.get('p2AncestorName');
                if (fid) {
                    return Ext.String.format('{0}: {1}', fid, name);
                }
                return 'No ' + p2AncestorType;
            }
        });
    },
    _buildGrid: function (artifactStore) {
        this.logger.log('_buildGrid',artifactStore);
        if (this.down('#grd')) {
            this.down('#grd').destroy();
        }

        this.down('#display_box').add({
            xtype: 'rallygrid',
            itemId: 'grd',
            store: artifactStore,
            columnCfgs: this._getColumnCfgs(),
            features: [{
                ftype: 'groupingsummary',
                groupHeaderTpl: '{name} ({rows.length})'
            }]
        });


    },

    _fetchArtifacts: function (iterationOids) {
        var deferred = Ext.create('Deft.Deferred');
        this.logger.log('_fetchArtifacts');

        var find = {
            "_TypeHierarchy": {$in: ['HierarchicalRequirement', 'Defect']},
            "Iteration": {$in: iterationOids},
            "__At": "current",
            "Children": null
        };

        var prj_id = this.getContext().getProject().ObjectID;
        if (this.getContext().getProjectScopeDown() === false) {
            find["Project"] = prj_id;
        } else {
            find["_ProjectHierarchy"] = {$in: [prj_id]}
        }

        var hydratedFields = ['ScheduleState'];
        var hydrate = ["_TypeHierarchy"];
        var fetch = ["FormattedID", 'ObjectID', 'Name', "_ItemHierarchy", "_TypeHierarchy"];
        var updatedFetch = Ext.Array.merge(fetch, this._getAdditionalFields());
        Ext.each(hydratedFields, function(hf){
            if (Ext.Array.contains(updatedFetch, hf)){
                hydrate.push(hf);
            }
        });

        this.logger.log('fetch', updatedFetch);
        Ext.create('Rally.data.lookback.SnapshotStore', {
            autoLoad: true,
            find: find,
            fetch: updatedFetch,
            hydrate: hydrate,
            limit: 'Infinity',
            listeners: {
                scope: this,
                load: function (store, records, success) {
                    this.logger.log('_fetchArtifacts success', records);
                    deferred.resolve(records);
                }
            }
        });
        return deferred;
    },
    _fetchArtifactsWsapi: function (iterationOids) {
        var deferred = Ext.create('Deft.Deferred');

        var iterationFilters = _.map(iterationOids, function (i) {
            return Ext.create('Rally.data.wsapi.Filter', {
                property: 'Iteration.ObjectID',
                value: i
            });
        });

        var filters = Ext.create('Rally.data.wsapi.Filter', {
            property: 'DirectChildrenCount',
            value: 0
        });
        filters = filters.and(Rally.data.wsapi.Filter.or(iterationFilters));

        var alwaysFetch = ["FormattedID", 'ObjectID', 'Name'];
        var fetch = Ext.Array.merge(alwaysFetch, this._getAdditionalFields);

        Ext.create('Rally.data.wsapi.artifact.Store', {
            models: ['Defect', 'UserStory'],
            filters: filters,
            fetch: fetch,
            autoLoad: true,
            context: {project: this.getContext().getProjectRef()},
            listeners: {
                load: function (store, data, success) {
                    deferred.resolve(data);
                }
            }
        });

        return deferred;
    },
    _getAdditionalFields: function () {
        return this.additionalFields;
    },
    _getAdditionalFieldsDisplayName: function (field) {
        return this.displayFieldMapping[field]|| field;

    },
    _fetchPortfolioItemHash: function (modelType) {
        var deferred = Ext.create('Deft.Deferred');

        Ext.create('Rally.data.wsapi.Store', {
            autoLoad: true,
            model: modelType,
            fetch: ['FormattedID', 'Name', 'ObjectID', 'Parent'],
            limit: 'Infinity',
            context: {workspace: this.getContext().getWorkspace()._ref, project: null},
            listeners: {
                scope: this,
                load: function (store, data, success) {
                    var pi_hash = {};
                    Ext.each(data, function (rec) {
                        pi_hash[rec.get('ObjectID')] = _.pick(rec.getData(), 'FormattedID', 'Name');
                    });
                    deferred.resolve(pi_hash);
                }
            }
        });

        return deferred;
    },
    _getColumnCfgs: function () {
        var gcolcfgs = [];
        gcolcfgs.push({
            text: 'Goal',
            dataIndex: 'p1AncestorFormattedID',
            flex: 1,
            renderer: function (v, m, r) {

                if (v) {
                    var link_text = Ext.String.format('{0}: {1}', v, r.get('p1AncestorName'));
                    return Rally.nav.DetailLink.getLink({record: r.get('p1AncestorRef'), text: link_text});
                }
                return '';
            }
        });
        gcolcfgs.push({
            text: 'Artifact',
            dataIndex: 'FormattedID',
            flex: 1,
            renderer: function (v, m, r) {
                if (v) {
                    var link_text = Ext.String.format('{0}: {1}', v, r.get('Name'));
                    return Rally.nav.DetailLink.getLink({record: r, text: link_text});
                }
                return '';
            }
        });
        var additionalFields = this._getAdditionalFields();
        Ext.each(additionalFields, function (f) {
            if (!Ext.Array.contains(this.alwaysSelectedFields, f)){
                var displayName = this._getAdditionalFieldsDisplayName(f);
                gcolcfgs.push({text: displayName, dataIndex: f});
            }
        }, this);
        this.logger.log('_getColConfigs',gcolcfgs);
        return gcolcfgs;
    },
    /********************************************
     /* Overrides for App class
     /*
     /********************************************/
    //getSettingsFields:  Override for App
    getSettingsFields: function() {

        return [{
                name: 'goal-activity-fields',
                xtype: 'rallyfieldpicker',
                modelTypes: ['HierarchicalRequirement', 'Defect'],
                labelWidth: 100,
                fieldLabel: 'Show Additional Columns',
                labelAlign: 'right',
                minWidth: 400,
                labelWidth: 150,
                margin: '10 0 255 0',
                autoExpand: false,
                alwaysExpanded: false,
                fieldBlackList: ['Iteration','Release','Owner','SubmittedBy']
            }
        ];
    },
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },
    //showSettings:  Override
    showSettings: function(options) {
        this._appSettings = Ext.create('Rally.app.AppSettings', Ext.apply({
            fields: this.getSettingsFields(),
            settings: this.getSettings(),
            defaultSettings: this.getDefaultSettings(),
            context: this.getContext(),
            settingsScope: this.settingsScope,
            autoScroll: true
        }, options));

        this._appSettings.on('cancel', this._hideSettings, this);
        this._appSettings.on('save', this._onSettingsSaved, this);
        if (this.isExternal()){
            if (this.down('#settings_box').getComponent(this._appSettings.id)==undefined){
                this.down('#settings_box').add(this._appSettings);
            }
        } else {
            this.hide();
            this.up().add(this._appSettings);
        }
        return this._appSettings;
    },
    _onSettingsSaved: function(settings){
        Ext.apply(this.settings, settings);
        this._hideSettings();
        this.onSettingsUpdate(settings);
    },
    //onSettingsUpdate:  Override
    onSettingsUpdate: function (settings){
        //Build and save column settings...this means that we need to get the display names and multi-list
        var additionalFields_setting = this.getSetting('goal-activity-fields') || [];
        if (additionalFields_setting instanceof Array){
            additionalFields = additionalFields_setting;
        } else {
            additionalFields = additionalFields_setting.split(',');
        }
        this.logger.log('onSettingsUpdate',settings, additionalFields);
        this._initializeApp(additionalFields);
    }
});