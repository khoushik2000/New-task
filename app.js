(function(){
    angular.module('taskManagerApp', ['ngRoute'])
    .config(['$routeProvider', function($routeProvider){
      $routeProvider
        .when('/login',{templateUrl:'login.html', controller:'LoginCtrl', controllerAs:'vm'})
        .when('/',{templateUrl:'dashboard.html', controller:'DashboardCtrl', controllerAs:'vm'})
        .when('/project/:id',{templateUrl:'project-detail.html', controller:'ProjectDetailCtrl', controllerAs:'vm'})
        .otherwise({redirectTo:'/'});
    }])
    .run(['$rootScope','$location','AuthService', function($rootScope,$location,AuthService){
      $rootScope.$on('$routeChangeStart', function(event, next){
        // Simple route guard: require login to access anything except login
        if(next && next.templateUrl !== 'login.html' && !AuthService.isAuthenticated()){
          $location.path('/login');
        }
      });
    }]);
  
    // Simple AuthService: in-memory/localStorage for demo
    angular.module('taskManagerApp')
    .factory('AuthService',['$window', function($window){
      var key = 'tm_user';
      return {
        login: function(user, pass){
          // Demo: accept any non-empty, store username
          if(user && pass){
            $window.localStorage.setItem(key, JSON.stringify({username:user}));
            return true;
          }
          return false;
        },
        logout: function(){
          $window.localStorage.removeItem(key);
        },
        currentUser: function(){
          var u = $window.localStorage.getItem(key);
          return u? JSON.parse(u).username : null;
        },
        isAuthenticated: function(){ return !!this.currentUser(); }
      };
    }]);
  
    // ProjectService
    angular.module('taskManagerApp')
    .factory('ProjectService',['$window', function($window){
      var key = 'tm_projects';
      function read(){ return JSON.parse($window.localStorage.getItem(key) || '[]'); }
      function write(v){ $window.localStorage.setItem(key, JSON.stringify(v)); }
  
      function uid(){ return 'p_' + Date.now() + '_' + Math.floor(Math.random()*1000); }
  
      return {
        list: function(){ return read(); },
        create: function(proj){
          var p = { id: uid(), name: proj.name, description: proj.description||'', tasks: [] };
          var all = read(); all.unshift(p); write(all); return p;
        },
        get: function(id){
          var all = read();
          for(var i=0;i<all.length;i++) if(all[i].id===id) return all[i];
          return null;
        },
        delete: function(id){
          var all = read().filter(function(p){ return p.id !== id; });
          write(all);
        },
        saveAll: function(projects){ write(projects); }
      };
    }]);
  
    // TaskService: stores tasks grouped by project in localStorage by project
    angular.module('taskManagerApp')
    .factory('TaskService',['$window','ProjectService', function($window, ProjectService){
      var key = 'tm_tasks'; // object mapping projectId -> [tasks]
      function read(){ return JSON.parse($window.localStorage.getItem(key) || '{}'); }
      function write(v){ $window.localStorage.setItem(key, JSON.stringify(v)); }
      function uid(){ return 't_' + Date.now() + '_' + Math.floor(Math.random()*1000); }
  
      // For scalability: load tasks in chunks
      return {
        loadTasks: function(projectId, offset, limit){
          offset = offset || 0; limit = limit || 10;
          var all = read();
          var arr = all[projectId] || [];
          return arr.slice(offset, offset + limit);
        },
        countTasks: function(projectId){
          var all = read(); return (all[projectId] || []).length;
        },
        create: function(projectId, task){
          var all = read();
          all[projectId] = all[projectId] || [];
          var newTask = {
            id: uid(),
            title: task.title,
            description: task.description||'',
            dueDate: (task.dueDate ? new Date(task.dueDate).toISOString() : new Date().toISOString()),
            priority: task.priority || 'Medium',
            status: task.status || 'Not Started',
            createdAt: new Date().toISOString()
          };
          all[projectId].unshift(newTask);
          write(all);
          return newTask;
        },
        update: function(projectId, updated){
          var all = read(); var arr = all[projectId] || [];
          for(var i=0;i<arr.length;i++){
            if(arr[i].id === updated.id){ arr[i] = updated; write(all); return arr[i]; }
          }
          return null;
        },
        delete: function(projectId, taskId){
          var all = read(); all[projectId] = (all[projectId] || []).filter(function(t){ return t.id !== taskId; }); write(all);
        },
        getAllForProject: function(projectId){ var all = read(); return all[projectId] || []; }
      };
    }]);
  
    // Top controller for header
    angular.module('taskManagerApp')
    .controller('TopCtrl',['AuthService','$location', function(AuthService,$location){
      var vm = this;
      vm.isAuthenticated = function(){ return AuthService.isAuthenticated(); };
      vm.currentUser = function(){ return AuthService.currentUser(); };
      vm.logout = function(){ AuthService.logout(); $location.path('/login'); };
    }]);
  
    // Login controller
    angular.module('taskManagerApp')
    .controller('LoginCtrl',['AuthService','$location', function(AuthService,$location){
      var vm = this; vm.username=''; vm.password='';
      vm.login = function(){
        if(AuthService.login(vm.username, vm.password)){
          $location.path('/');
        } else {
          alert('Invalid credentials (demo requires non-empty username/password).');
        }
      };
    }]);
  
    // Dashboard controller
    angular.module('taskManagerApp')
    .controller('DashboardCtrl',['ProjectService','TaskService', function(ProjectService, TaskService){
      var vm = this;
      vm.projects = ProjectService.list();
      vm.newProject = {};
      vm.addProject = function(){
        if(!vm.newProject.name) return;
        var p = ProjectService.create(vm.newProject);
        vm.projects.unshift(p);
        vm.newProject = {};
      };
      vm.deleteProject = function(id){
        if(!confirm('Delete project and its tasks?')) return;
        ProjectService.delete(id);
        // remove tasks too
        var tasks = TaskService.getAllForProject(id);
        // write empty mapping
        var all = JSON.parse(localStorage.getItem('tm_tasks') || '{}'); all[id] = []; localStorage.setItem('tm_tasks', JSON.stringify(all));
        vm.projects = ProjectService.list();
      };
      vm.countByStatus = function(project, status){
        var tasks = TaskService.getAllForProject(project.id);
        if(!status) return tasks.length;
        return tasks.filter(function(t){ return t.status === status; }).length;
      };
  
      // show recent tasks across all projects
      vm.recentTasks = [];
      (function loadRecent(){
        var ps = ProjectService.list();
        ps.forEach(function(p){
          var tasks = TaskService.loadTasks(p.id, 0, 5);
          tasks.forEach(function(t){
            var copy = angular.extend({}, t); copy.projectName = p.name; vm.recentTasks.push(copy);
          });
        });
        // sort by dueDate ascending
        vm.recentTasks.sort(function(a,b){ return new Date(a.dueDate) - new Date(b.dueDate); });
      })();
  
      vm.filterStatus = '';
      vm.sortBy = '-dueDate';
    }]);
  
    // Project detail controller (lazy load tasks)
    angular.module('taskManagerApp')
    .controller('ProjectDetailCtrl',['$routeParams','ProjectService','TaskService','$scope', function($routeParams,ProjectService,TaskService,$scope){
      var vm = this;
      vm.project = ProjectService.get($routeParams.id) || {name:'(not found)', description:''};
      vm.tasks = [];
      vm.offset = 0;
      vm.limit = 10;
      vm.hasMore = false;
      vm.newTask = {priority:'Medium', status:'Not Started'};
  
      vm.loadTasks = function(reset){
        if(reset){ vm.offset=0; vm.tasks = []; }
        var chunk = TaskService.loadTasks(vm.project.id, vm.offset, vm.limit);
        if(chunk && chunk.length){
          vm.tasks = vm.tasks.concat(chunk);
          vm.offset += chunk.length;
        }
        vm.hasMore = TaskService.countTasks(vm.project.id) > vm.tasks.length;
        $scope.$applyAsync();
      };
  
      vm.addTask = function(){
        if(!vm.newTask.title) return;
        var t = TaskService.create(vm.project.id, vm.newTask);
        vm.tasks.unshift(t);
        vm.newTask = {priority:'Medium', status:'Not Started'};
        vm.hasMore = TaskService.countTasks(vm.project.id) > vm.tasks.length;
      };
  
      vm.deleteTask = function(id){
        if(!confirm('Delete this task?')) return;
        TaskService.delete(vm.project.id, id);
        vm.tasks = vm.tasks.filter(function(x){ return x.id !== id; });
        vm.hasMore = TaskService.countTasks(vm.project.id) > vm.tasks.length;
      };
  
      vm.editTask = function(task){
        var updated = angular.copy(task);
        // simple inline edit via prompt (replace with modal in real app)
        var newTitle = prompt('Edit title', updated.title);
        if(newTitle !== null){
          updated.title = newTitle;
          TaskService.update(vm.project.id, updated);
          for(var i=0;i<vm.tasks.length;i++) if(vm.tasks[i].id===updated.id){ vm.tasks[i]=updated; break; }
        }
      };
  
      vm.toggleComplete = function(task){
        task.status = task.completed ? 'Completed' : 'In Progress';
        TaskService.update(vm.project.id, task);
      };
  
      vm.loadMore = function(){ vm.loadTasks(); };
  
      // initial load (lazy)
      vm.loadTasks(true);
    }]);
  })();
  
