'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

var NotificationSchema = new Schema({
  userID: {type: String, ref: 'User', required: true},
  fromUserID: {type: String, ref: 'User', required: true},
  notificationType: {type: String, required: true},
  notificationStatus: {type: String, required: true},
  referenceClass: {type: String, ref: 'Userclass', required: true}
});

module.exports = mongoose.model('Notification', NotificationSchema);