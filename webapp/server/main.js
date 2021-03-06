'use strict';

import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import {check} from 'meteor/check';



Meteor.startup(() => {
  // code to run on server at startup
});

// Publications
Meteor.publish('videoPairs', function() {
  return VideoPairs.find();
});

Meteor.publish('videos', function() {
  return VideoData.find();
});

Meteor.publish('videoUploads', function() {
  return VideoUploads.find();
});

Meteor.publish('datasets', function() {
  return DataSets.find();
});

Meteor.publish('testResults', function() {
  return TestResults.find();
});

Meteor.publish('expertComments', function() {
  return ExpertComments.find();
});

Meteor.publish('videoPairVoteCount', function() {
  return VideoPairVoteCount.find();
});


Meteor.methods({
  'datasets.insert'(name, data) {
    check(name, String);
    if(! this.userId) {
      throw new Meteor.Error('not-authorized');
    }

    console.log(`Inserting dataset:${name}`);
    console.log(`Accessed by: ${this.userId}`);

    DataSets.insert({
      name: name,
      data: data
    });
  },

  'videos.insert'(datasetName, wptId, fileId) {
    check(datasetName, String);
    check(wptId, String);
    if(! this.userId) {
      throw new Meteor.Error('not-authorized');
    }
    console.log('Inserting video');
    VideoData.insert({
      dataset: datasetName,
      wptId: wptId,
      fileId: fileId
    });
  },

  'videos.remove'(datasetName, wptId) {
    if(! this.userId) {
      throw new Meteor.Error('not-authorized');
    }
    console.log('Removing video');
    var video = VideoData.findOne({dataset: datasetName, wptId: wptId});
    if(video) {
      var fileRef = video.fileId;
      VideoUploads.remove(fileRef);
      VideoData.remove(video._id);
    }
  },

  'videoPairs.insert'(obj) {
    if(! this.userId) {
      throw new Meteor.Error('not-authorized');
    }
    console.log('Inserting test/train pairs');
    VideoPairs.insert(obj);
  },

  'videoPairs.toggle'(id) {
    if(! this.userId) {
      throw new Meteor.Error('not-authorized');
    }
    console.log('Changing approval of test/train pair:' + id);
    var pair = VideoPairs.findOne({_id: id});
    console.log(pair);
    VideoPairs.update({_id: id}, {$set:{approved: !(pair.approved)}});
  },

  'testResults.insert'(obj) {
    var conn = this.connection;
    // de-duplication
    var existing = TestResults.findOne({$and: [
      {pairId:obj.pairId},
      {session: obj.session}]
    });

    // console.log(existing)
    var updateVoteCount = true;
    if(existing) {
      updateVoteCount = false;
      TestResults.remove({_id: existing._id});
    }
    _.extend(obj, {
        ip: conn.clientAddress,
        userAgent: conn.httpHeaders['user-agent'],
        timestamp: new Date()
      });
    TestResults.insert(obj);

    // Update vote count
    var videoPair = VideoPairs.findOne({_id:obj.pairId})
    if (videoPair.type == "train") {
      updateVoteCount = false
    }
    if(updateVoteCount) {
      var pairVoteCount = VideoPairVoteCount.findOne({pairId: obj.pairId});
      // console.log('Before insert')
      // console.log(pairVoteCount)
      if (!!pairVoteCount) {
        var count = pairVoteCount.count + 1;
        VideoPairVoteCount.update(pairVoteCount._id, {$set: {count: count}});
      } else {
        VideoPairVoteCount.insert({pairId: obj.pairId, count: 1});
      }
    }
  },

  'userInfo.insert'(gender, age, occupation, session) {
    check(gender, String);
    check(age, String);
    check(occupation, String);
    check(session, String);
    UserInfo.insert(
      {
        session: session,
        gender: gender,
        age: age,
        occupation: occupation
      }
    );
  },

  'visualResponse.insert'(obj) {
    _.extend(obj, {timestamp: new Date()});
    VisualResponse.insert(obj);
  },

  'feedbacks.insert'(feedback, session) {
    check(feedback, String);
    check(session, String);
    if(feedback.length > 500) {
      feedback = feedback.substring(0, 500);
    }
    console.log("Storing user feedback");
    UserFeedbacks.insert(
      {
        session: session,
        feedback: feedback,
        timestamp: new Date()
      }
    );
  },

  'expertComments.insert'(comment, pairId) {
    if (! this.userId) {
      throw new Meteor.Error('not-authorized');
    }

    ExpertComments.insert(
    {
      pairId: pairId,
      comment: comment,
      timestamp: new Date()
    });
  },

  'videoPairVoteCount.insertOrUpdate'(pairId, voteCount) {
    if (! this.userId) {
      throw new Meteor.Error('not-authorized');
    }

    var existing = VideoPairVoteCount.findOne({pairId: pairId})
    if (!!existing) {
      VideoPairVoteCount.update(existing._id, {$set: {count: voteCount}});
    } else {
      VideoPairVoteCount.insert({pairId: pairId, count: voteCount})
    }
  },

  'purge.dataset'(datasetId) {
    if(! this.userId) {
      throw new Meteor.Error('not-authorized');
    }
    console.log("Purging dataset with id: " + datasetId);

    // Remove all videoPairs
    var pairs = VideoPairs.find({datasetId: datasetId}).fetch();
    _.each(pairs, function(p) {
      // Remove all results
      var results = TestResults.find({pairId: p._id}).fetch();
      _.each(results, function(r) {
        TestResults.remove(r._id);
      });
      VideoPairs.remove(p._id);
    });

    // Remove all files.
    var dataset = DataSets.findOne({_id: datasetId});
    var videos = VideoData.find({dataset: dataset.name}).fetch();
    _.each(videos, function(video){
      var fileRef = video.fileId;
      VideoUploads.remove(fileRef);
      VideoData.remove(video._id);
    });

    // Remove dataset
    DataSets.remove(datasetId);
  }
});
