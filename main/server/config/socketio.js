/**
 * Socket.io configuration
 */

'use strict';

var events = require('events');
var moment = require('moment');
var Helper = require('../common/helper')
var config = require('./environment');
var User = require('../api/user/user.model');
var Userclass = require('../api/userclass/userclass.model');
var Transaction = require('../api/transaction/transaction.model');
var Wallet = require('../api/wallet/wallet.model');
var Scheduler = require('../api/scheduler/scheduler.model');
var eventEmitter = new events.EventEmitter();

var liveClassList = [];
// var userSockets = [];
var liveClassUsers = [];
var onlineUsers = [];
var classSessions = {};


// Pass eventEmitter to api controllers
require('../api/userclass/userclass.controller').setEvenetEmitter(eventEmitter);
require('../api/transaction/transaction.controller').setEvenetEmitter(eventEmitter);

// When the user disconnects.. perform this
function onDisconnect(socket) {
  var userID = socket.decoded_token._id;
  if(liveClassUsers[socket.decoded_token._id] !== undefined && liveClassUsers[socket.decoded_token._id].id === socket.id){
    console.log("User Left Live Class");
    var userClassID = liveClassUsers[userID].classID;
    
    if(liveClassList[userClassID] !== undefined){
      for(var i = 0; i < liveClassList[userClassID].connectedUser.length; i++){
        if(liveClassList[userClassID].connectedUser[i] !== userID){
          liveClassUsers[liveClassList[userClassID].connectedUser[i]].emit('userLeftClass', {});
        }
      }
      var liveClassUserIndex = liveClassList[userClassID].connectedUser.indexOf(userID);
      delete liveClassList[userClassID].connectedUser.splice(liveClassUserIndex, 1);
      endSession(userClassID, userID);
    }
    
    delete liveClassUsers[userID];
  }
  delete onlineUsers[userID];
}

// When the user connects.. perform this
function onConnect(socket) {
  var userID = socket.decoded_token._id;
  onlineUsers[userID] = socket;

  socket.on('joinClass', function(data,  callback){
    var output = {
          success : false
        },
        classID = data.classID,
        peerID = data.peerID,
        userID = socket.decoded_token._id;

    if(liveClassUsers[userID] === undefined){
      Userclass.findById(classID, function (err, userclass) {
        if(err || !userclass) { 
        // if(false) { 
          output.success = false;
          output.error = {
            type: 'invalid_class',
            description: "This class doesnot exists"
          };
        }else{
          liveClassUsers[userID] = socket;
          liveClassUsers[userID].classID = classID;
          liveClassUsers[userID].peerID = peerID;
          if(liveClassList[classID] === undefined){
            liveClassList[classID] = {
              classDetails: userclass,
              connectedUser: [userID]
            }
          }else{
            liveClassList[classID].connectedUser.push(userID);
          }
          output.success = true
          output.classDetails = userclass
        }
        callback(output);
        startLiveClass(classID);
      });
    }else{
      // liveClassUsers[userID].emit('alreadyLoggedIn', {});
      output.success = false;
      output.error = {
        type: 'alreaday_logged_in',
        description: "You are already logged in from a different browser or tab"
      };
      callback(output);
    }
  })

  socket.on('endClass', function(data,  callback){
    var output = {
          success : false
        },
        classID = data.classID,
        peerID = data.peerID,
        userID = socket.decoded_token._id;

    if(liveClassUsers[userID].classID === classID){
      endClass(classID, userID);
      output.success = true
    }
    callback(output);
  });  
}

function startLiveClass(classID){
  if(liveClassList[classID] !== undefined){
    if(liveClassList[classID].connectedUser.length === 2){
      console.log("Requesting start class");
      liveClassList[classID].status = "ongoing";
      liveClassList[classID].startTime = moment().valueOf();

      for(var i = 0; i < liveClassList[classID].connectedUser.length; i++){
        liveClassUsers[liveClassList[classID].connectedUser[i]].emit('startClass', {
          'caller'    : {
            userID: liveClassList[classID].connectedUser[0],
            peerID: liveClassUsers[liveClassList[classID].connectedUser[0]].peerID
          },
          'receiver'  : {
            userID: liveClassList[classID].connectedUser[1],
            peerID: liveClassUsers[liveClassList[classID].connectedUser[1]].peerID
          }
        });
      }

      startSession(classID);
    }
  }
}

function startSession(classID){
  if(liveClassList[classID].status === "ongoing"){
    if(classSessions[classID] === undefined){
      classSessions[classID] = [];
    }
    classSessions[classID].push({
      start: moment().valueOf(),
      end: null,
      disconnectedBy: null,
      totalDuration: null
    });
  }
}

function endSession(classID, userID){
  if(liveClassList[classID].status === "ongoing"){
    classSessions[classID][classSessions[classID].length - 1].end = moment().valueOf();
    classSessions[classID][classSessions[classID].length - 1].disconnectedBy = userID;
    classSessions[classID][classSessions[classID].length - 1].totalDuration = classSessions[classID][classSessions[classID].length - 1].end - classSessions[classID][classSessions[classID].length - 1].start;
  }
}

function endClass(classID, endedBy){
  var totalRunTime = 0;
  if(liveClassList[classID] !== undefined){
    if(liveClassList[classID].connectedUser.length > 0){
      console.log("Requesting end class to users");
      if(classSessions[classID][classSessions[classID].length - 1].end === null){
        endSession(classID, endedBy);
      }
      for(var i = 0; i < liveClassList[classID].connectedUser.length; i++){
        liveClassUsers[liveClassList[classID].connectedUser[i]].emit('endClass');
        var userID = liveClassList[userClassID].connectedUser[i];
        delete liveClassUsers[userID];
      }
      for(var i = 0; i < classSessions[classID].length; i++){
        totalRunTime += classSessions[classID].totalDuration;
      }
    }
  }
  Userclass
  .findById(classID, function (err, userclass){
    // Transfer money from student wallet to  teacher's wallet
    // var studentID = liveClassList[classID].classDetails.studentID;
    // var teacherID = liveClassList[classID].classDetails.teacherID;
    // var totalCost = liveClassList[classID].classDetails.amount.totalCost;
    // var paidToTeacher = parseFloat(liveClassList[classID].classDetails.amount.paidToTeacher);

    var studentID = userclass.studentID;
    var teacherID = userclass.teacherID;
    var totalCost = userclass.amount.totalCost;
    var paidToTeacher = parseFloat(userclass.amount.paidToTeacher);

    var commission = parseFloat(totalCost - paidToTeacher);
    userclass.status = "completed";
    if(totalRunTime < 0 && endedBy !== teacherID){
     userclass.status = "preEnded";
    }
    console.log("Updating class data");
    userclass.save(function (err, updateduserclass){
      if(updateduserclass.status === 'completed'){
        var transactionDataForTeacher = {
          userID: teacherID,
          transactionType: 'Credit',
          transactionIdentifier: 'walletCashReceived',
          transactionDescription: 'Wallet cash for INR ' + paidToTeacher + ' received',
          transactionAmount: paidToTeacher,
          classRefrence: userclass._id,
          status: 'completed'
        }
        console.log("Updating transaction data");
        Transaction.create(transactionDataForTeacher, function(err){
          Wallet.findOne({
            userID: teacherID
          }, function(err, walletData){
            walletData.withdrawBalance = parseFloat(walletData.withdrawBalance + paidToTeacher);
            walletData.totalBalance = parseFloat(walletData.totalBalance + paidToTeacher);
            console.log("Updating wallet data");
            walletData.save(function(err){
              var transactionDataForTakhshila = {
                transactionType: 'Credit',
                transactionIdentifier: 'commissionReceived',
                transactionDescription: 'Commission for INR ' + commission + ' received',
                transactionAmount: commission,
                classRefrence: userclass._id,
                status: 'completed'
              }

              Transaction.create(transactionDataForTakhshila, function(err){
                console.log('Transaction after completion of class has been completed');
              });
            });
          });
        });
      }
      delete liveClassList[classID];
    });
  });

}

module.exports = function (socketio) {
  // socket.io (v1.x.x) is powered by debug.
  // In order to see all the debug output, set DEBUG (in server/config/local.env.js) to including the desired scope.
  //
  // ex: DEBUG: "http*,socket.io:socket"

  // We can authenticate socket.io users and access their token through socket.handshake.decoded_token
  //
  // 1. You will need to send the token in `client/components/socket/socket.service.js`
  //
  // 2. Require authentication here:

  socketio.use(require('socketio-jwt').authorize({
    secret: config.secrets.session,
    handshake: true
  }));

  socketio.on('connection', function (socket) {
    socket.address = socket.handshake.address !== null ?
            socket.handshake.address.address + ':' + socket.handshake.address.port :
            process.env.DOMAIN;

    socket.connectedAt = new Date();

    // Call onDisconnect.
    socket.on('disconnect', function () {
      onDisconnect(socket);
      console.info('[%s] DISCONNECTED', socket.handshake.address);
    });

    // Call onConnect.
    onConnect(socket);
    console.info('[%s] CONNECTED', socket.handshake.address);
  });
};


eventEmitter.on('paymentInitialised', function(data){
  console.log('Captured Event');
  console.log(data);
});

eventEmitter.on('notifyUser', function(data){
  console.log('Received event: Notifying user');
  var classID = data.classId;
  var classLink = 'http://localhost:9000/liveclass/' + classID;
  Userclass
  .findById(classID)
  .populate('studentID teacherID')
  .exec(function (err, userclass){
    var users = {
      student: userclass.studentID,
      teacher: userclass.teacherID
    };
    if(liveClassList[classID] === undefined){
      liveClassList[classID] = {
        classDetails: null,
        connectedUser: []
      }
    }
    for(var userType in users){
      var user = users[userType];
      console.log("user._id.toString()");
      console.log(user._id.toString());
      console.log("onlineUsers");
      console.log(onlineUsers);
      if(onlineUsers[user._id.toString()] === undefined){
        var textMessage = 'Hi ' + user.name.firstName + '! Your takhshila class is about to start. Please visit ' + classLink;
        Helper.sendTextMessage(user.phone, textMessage);
      }else{
        onlineUsers[user._id.toString()].emit('liveClassLink', {
          classLink: classLink,
          classID: classID
        });
      }
    }
  })
});

eventEmitter.on('endClass', function(data){
  console.log('Received event: End class');
  var classID = data.classId;
  endClass(classID, null);
})



function sendTextMessage(phone, message){
  console.log('Message sent to ' + phone);
  console.log('Message text is ' + message);
}


function reInitializeScheduler(){
  console.log("reInitializeScheduler called");
  var _currentTime = moment().valueOf();
  Scheduler
  .find({
    jobTime: {$gte: _currentTime}
  })
  .exec(function (err, schedulers) {
    for(var i = 0; i < schedulers.length; i++){
      var eventName = schedulers[i].jobName;
      var eventData = {
        time: schedulers[i].jobTime,
        data: JSON.parse(schedulers[i].jobData)
      }
      console.log("eventData");
      console.log(eventData);
      eventEmitter.emit(eventName, eventData);
    }
  });
}

reInitializeScheduler();