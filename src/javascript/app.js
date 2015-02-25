Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    items: [
        {xtype:'container',itemId:'message_box',tpl:'Hello, <tpl>{_refObjectName}</tpl>'},
        {xtype:'container',itemId:'selector_box', padding: 15, layout: {type: 'hbox'}},
        {xtype:'container',itemId:'display_box', padding: 15},
        {xtype:'tsinfolink'}
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
    launch: function() {
        var promises = [];
        promises.push(this._fetchPortfolioItemHash(this.p1AncestorTypePath));
        promises.push(this._fetchPortfolioItemHash(this.p2AncestorTypePath));
        Deft.Promise.all(promises).then({
            scope: this,
            success: function(hashes){
              this.logger.log('_fetchPortfolioItemHash x 2',hashes);
              this.p1AncestorHash = hashes[0];
              this.p2AncestorHash = hashes[1];
              this._addIterationSelector(); 
            }
        });      
     },
    _addIterationSelector: function(){
        
        var prj = this.getContext().getProjectRef();
        //This will only show iterations for the current project.  
        this.down('#selector_box').add({
            xtype: 'rallyiterationcombobox',
            itemId: 'cb-iteration',
            storeConfig: {
                context: {
                    project: this.getContext().getProjectRef(), 
                    projectScopeDown: false, 
                    projectScopeUp: false}
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
            handler: this._export
        });
    },
    _export: function(){
        if (this.exportData){
            this.logger.log('_export', this.exportHash);
            var text = Rally.technicalservices.FileUtilities.convertDataArrayToCSVText(this.exportData, this.exportHash);
            Rally.technicalservices.FileUtilities.saveTextAsFile(text, 'goal-activity.csv');
        }
    },
    _fetchIterations: function(iterationName){
        var deferred = Ext.create('Deft.Deferred');
        Ext.create('Rally.data.wsapi.Store',{
            autoLoad: true, 
            model: 'Iteration',
            fetch: ['Name','ObjectID'],
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
                load: function(store, records, success){
                    this.logger.log('_fetchIterations', records);
                    deferred.resolve(records);
                }
            }
        });
        return deferred;  
    },
    _prepareGridData: function(iterationCombobox){
        //First, if the project is scoped down, we need to get all matching iterations.  
        
        if (this.down('#grd')){
            this.down('#grd').destroy();  
        }

        
        var iterations = [];  
        var rec = iterationCombobox.getRecord();  
        this.logger.log('_prepareGridData',rec);
        if (rec) {
            if (this.getContext().getProjectScopeDown()){
                var iteration_name = rec.get('Name');
                this._fetchIterations(iteration_name).then({
                    scope: this, 
                    success: function(iterationRecords){
                        this.logger.log('_prepareGridData success (iterations)', iterationRecords.length);
                        Ext.each(iterationRecords, function(irec){
                            iterations.push(irec.get('ObjectID'));
                        });
                        this._fetchArtifacts(iterations).then({
                            scope: this,
                            success: function(artifactRecords){
                                this.logger.log('_prepareGridData success (artifacts)',artifactRecords.length);
                                var artifact_store = this._mungeArtifactRecords(artifactRecords);
                                this._buildGrid(artifact_store);
                            }
                        });
                    }
                });
            } else {
                iterations.push(rec.get('ObjectID'));
                this._fetchArtifacts(iterations).then({
                    scope: this,
                    success: function(artifactRecords){
                        this.logger.log('_prepareGridData success (artifacts)', artifactRecords.length);
                        var artifact_store = this._mungeArtifactRecords(artifactRecords);
                        this._buildGrid(artifact_store);
                    }
                });
            }
        }
        
    },
    _mungeArtifactRecords: function(artifactRecords){
        this.logger.log('_mungeArtifactRecords');
        
        var p1Ancestors = this.p1AncestorHash;
        var p1AncestorKeys = _.map(_.keys(p1Ancestors),function(oid){return Number(oid)});
        var p2Ancestors = this.p2AncestorHash;  
        var p2AncestorKeys = _.map(_.keys(p2Ancestors),function(oid){return Number(oid)});
        var p2AncestorType = this.p2AncestorType;
       this.logger.log('_mungeArtifactRecords', p1AncestorKeys, p2AncestorKeys);
        var data = []; 
        console.log(_.keys(p1Ancestors));
        Ext.each(artifactRecords, function(rec){
            var p1AncestorOid = _.intersection(p1AncestorKeys, rec.get('_ItemHierarchy'))[0] || null;
            var p1AncestorFid = null, p1AncestorName = null;  
            var p2AncestorOid = _.intersection(p2AncestorKeys, rec.get('_ItemHierarchy'))[0] || null;
            var p2AncestorFid = null, p2AncestorName = null;  
            var p1Ref = null;
            var p2Ref = null; 
            
            this.logger.log('_mungeAritfactRecords ancestors', p1AncestorOid, p2AncestorOid);
            if (p1AncestorOid > 0){
                p1AncestorFid = p1Ancestors[p1AncestorOid].FormattedID;  
                p1AncestorName = p1Ancestors[p1AncestorOid].Name;  
                p1Ref = Ext.String.format('/{0}/{1}',this.p1AncestorTypePath.toLowerCase(),p1AncestorOid);
                this.logger.log('p1 ancestor',p1Ref, p1AncestorFid, p1AncestorName);
            }
              
          if (p2AncestorOid){
              p2AncestorFid = p2Ancestors[p2AncestorOid].FormattedID;  
              p2AncestorName = p2Ancestors[p2AncestorOid].Name;  
              p2Ref = Ext.String.format('/{0}/{1}',this.p2AncestorTypePath.toLowerCase(),p2AncestorOid);
              this.logger.log('p2 ancestor',p2Ref, p2AncestorFid);
          }
              
            var ref_string = Ext.String.format('/{0}/{1}',rec.get('_TypeHierarchy').slice(-1)[0],rec.get('ObjectID'));  
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
            data.push(munged_rec);
        },this);
        this.logger.log('_mungeArtifactRecords data',data);
        this.exportData = data;  
        
        return Ext.create('Rally.data.custom.Store', {
            data: data,
            groupField: 'p2AncestorFormattedID',
            groupDir: 'ASC',
            pageSize: 200,
            getGroupString: function(record) {
                var fid = record.get('p2AncestorFormattedID');
                var name = record.get('p2AncestorName');
                if (fid){
                    return Ext.String.format('{0}: {1}',fid,name);
                }
                return 'No ' + p2AncestorType;
            }
        });
    },
       _buildGrid: function(artifactStore){
        this.logger.log('_buildGrid');
        if (this.down('#grd')){
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
    _fetchArtifacts: function(iterationOids){
        var deferred = Ext.create('Deft.Deferred');
        this.logger.log('_fetchArtifacts');
        var find = {
                "_TypeHierarchy": {$in: ['HierarchicalRequirement','Defect']},
                "Iteration": {$in: iterationOids},
                "__At": "current",
                "Children": null
        };
        var prj_id = this.getContext().getProject().ObjectID;  
        if (this.getContext().getProjectScopeDown() === false){
            find["Project"] = prj_id;  
        } else {
            find["_ProjectHierarchy"] = {$in: [prj_id]}
        }
        
        Ext.create('Rally.data.lookback.SnapshotStore',{
           autoLoad: true,
           find: find,
           fetch: ["FormattedID",'ObjectID','Name',"_ItemHierarchy","_TypeHierarchy"],
           hydrate: ["_TypeHierarchy"],
           limit: 'Infinity',
           listeners: {
               scope: this,
               load: function(store, records, success){
                   this.logger.log('_fetchArtifacts success', records);
                   deferred.resolve(records);
               }
           }
        });
        return deferred; 
    },
    _fetchPortfolioItemHash: function(modelType){
        var deferred = Ext.create('Deft.Deferred');
        
        Ext.create('Rally.data.wsapi.Store',{
            autoLoad: true,
            model: modelType,  
            fetch: ['FormattedID','Name','ObjectID','Parent'],
            limit: 'Infinity',
            context: {workspace: this.getContext().getWorkspace()._ref, project: null},
            listeners: {
                scope: this,
                load: function(store,data,success){
                    var pi_hash = {};  
                    Ext.each(data, function(rec){
                        pi_hash[rec.get('ObjectID')] = _.pick(rec.getData(),'FormattedID','Name');
                    });
                    deferred.resolve(pi_hash);
                }
            }
        });
        
        return deferred; 
    },
    _getColumnCfgs: function(){
        var gcolcfgs = [];
        gcolcfgs.push({ 
            text: 'Goal',
            dataIndex: 'p1AncestorFormattedID',
            flex: 1,
            renderer: function(v,m,r){
                
                if (v){
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
            renderer: function(v,m,r){
                if (v){
                    var link_text = Ext.String.format('{0}: {1}', v, r.get('Name')); 
                    return Rally.nav.DetailLink.getLink({record: r, text: link_text});
                }
                return '';
            }
        });
        return gcolcfgs;
    }
});