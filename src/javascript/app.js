Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    items: [
        {xtype:'container',itemId:'message_box',tpl:'Hello, <tpl>{_refObjectName}</tpl>'},
        {xtype:'container',itemId:'display_box', padding: 15},
        {xtype:'tsinfolink'}
    ],
    goalTypePath: 'PortfolioItem/Goal',
    portfolioItemHash: {},  
    projectHash: {},
    title: 'Goal Activity by Project',
    launch: function() {
        
        var project_items = [];
        this._fetchProjects().then({
            scope: this,
            success: function(projectHash){
                this.projectHash = projectHash;
        
                this._fetchPortfolioItemHash().then({
                    scope: this,
                    success: function(hash){
                        this.portfolioItemHash = hash;  
                        this.logger.log('portfolioItemHash',this.portfolioItemHash);
                        project_items.push(this._addProjectContainer('ctprj-' + this.getContext().getProject().ObjectID, this.getContext().getProject()));

                        var counter = 0;
                        Ext.Object.each(this.projectHash, function(oid, project){
                            counter++;
                            console.log(project);
                            project_items.push(this._addProjectContainer('ctprj-' + oid, project));
                            if (counter > 2){
                               return false;
                            }
                        }, this);
                        
                        var accordion = Ext.create('Ext.panel.Panel', {
                            title: this.title,
                            defaults: {
                                bodyStyle: 'padding:15px'
                            },
                            layout: {
                                type: 'accordion',
                                titleCollapse: false,
                                animate: true,
                                activeOnTop: true
                            },
                            items: project_items
                        });
                        this.down('#display_box').add(accordion);
                    }
                });
            }
        });

     },
    _addProjectContainer: function(containerId, project){
        
        var panel_width = this.down('#display_box').width * 0.95;
        
        var prj_container = Ext.create('Ext.panel.Panel', {
            itemId: containerId,
            title: project.Name,
            width: panel_width
        });
        
        var cb_prj = prj_container.add({
            xtype: 'rallyiterationcombobox',
            itemId: 'cb-iteration',
            storeConfig: {
                context: {project: project._ref, projectScopeDown: false, projectScopeUp: false}
            },
            listeners: {
                scope: this,
                select: function(cb){
                    cb.bubble(this._updateGrid, this);
                },
                ready: function(cb){
                    cb.bubble(this._updateGrid, this);
                }
            }
        });
        return prj_container;
    },
    _updateGrid: function(ct){
        if (ct.itemId && ct.itemId.match(/^ctprj-/)){
            
            if (ct.down('#grd-story')){
                ct.down('#grd-story').destroy();
            }
            var project_id = this.getContext().getProject().ObjectID;
            var iteration_id = ct.down('#cb-iteration').getRecord().get('ObjectID');
            
            var store = this._fetchProjectItems(project_id, iteration_id).then({
                scope: this,
                success: function(store){
                    ct.add({
                        xtype: 'rallygrid',
                        itemId: 'grd-story',
                        store: store,
                        columnCfgs: this._getColumnCfgs()
                    });
                    
                }
            });
            
        }
    },
    _fetchProjectItems: function(projectId, iterationId){
        var deferred = Ext.create('Deft.Deferred');
        this.logger.log('_fetchProjectItems',projectId, iterationId);
        
            Ext.create('Rally.data.lookback.SnapshotStore', {
                autoLoad: true,
                listeners: {
                    scope: this, 
                    load: function(store, data, success) {
                        var pids = _.map(Ext.Object.getKeys(this.portfolioItemHash),function(oid){return Number(oid)});
                        var custom_data = [];  
                        Ext.each(data, function(rec){
                            var piFid = null, 
                                piName = null, 
                                pid = _.intersection(pids,rec.get('_ItemHierarchy'))[0] || null;

                            if (pid){
                                piFid = this.portfolioItemHash[pid.toString()].FormattedID;
                                piName = this.portfolioItemHash[pid.toString()].Name;
                            }

                            custom_data.push({
                                FormattedID: rec.get('FormattedID'), 
                                Name: rec.get('Name'), 
                                piFormattedID: piFid, 
                                piName: piName, 
                                piObjectID: pid
                            });
                        }, this);
                        
                        
                        var custom_store = Ext.create('Rally.data.custom.Store',{
                            data: custom_data
                        });
                        
                        deferred.resolve(custom_store);
                    }
                },
                fetch: ['Name', 'FormattedID','Owner','_TypeHierarchy', '_ItemHierarchy','Parent'],
                hydrate: ['_TypeHierarchy'],
                find: {
                    "_TypeHierarchy": {$in: ['Defect','HierarchicalRequirement']},
                    "Iteration": iterationId,
                    "Project": projectId,
                    "__At": "current"
                }
            });                    
        
        return deferred; 
    },
    _fetchPortfolioItemHash: function(){
        var deferred = Ext.create('Deft.Deferred');
        
        Ext.create('Rally.data.wsapi.Store',{
            autoLoad: true,
            model: this.goalTypePath,  
            fetch: ['FormattedID','Name','ObjectID'],
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
    _fetchProjects: function(){
        var deferred = Ext.create('Deft.Deferred');

        Ext.create('Rally.data.wsapi.Store',{
            model: 'Project',
            context: {workspace: this.getContext().getWorkspace()._ref, project: null},
            fetch: ['Name','ObjectID'],
            autoLoad: true,
            listeners: {
                scope: this, 
                load: function(store, data, success){
                    var projects = {};
                    Ext.each(data, function(rec){
                        projects[rec.get('ObjectID')] = _.pick(rec.getData(),'Name','_ref');
                    });
                    this.logger.log('_fetchProjects success',projects);
                    deferred.resolve(projects);
                }
            }
        });
        return deferred;  
    },
    _getColumnCfgs: function(){
        var gcolcfgs = [];
        gcolcfgs.push({ 
            text: 'FormattedID',
            dataIndex: 'FormattedID'
        });
        gcolcfgs.push({ 
            text: 'Name',
            dataIndex: 'Name',
            flex: 1
        });
        gcolcfgs.push({ 
            text: 'Goal',
            dataIndex: 'piFormattedID'
        });
        gcolcfgs.push({ 
            text: 'Goal Name',
            dataIndex: 'piName',
            flex: 1
        });
        return gcolcfgs;
    }
});