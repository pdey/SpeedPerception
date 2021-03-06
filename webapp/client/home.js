// Js helpers for the main AB testing templates.
var videosForCurrentSession = null;
var currentPair = null;
var curIndex = 0;
var visualResponseCount = 0;

var _scoreDeps = new Deps.Dependency;
var _progressDeps = new Deps.Dependency;
var passedTrainingData = {};
var totalTrainingData = 0;

var videoStartTime = 0;
var replayCount = 0;

var visualResponseStartTime = 0;
var playAgain = false;

// randomly select 8 test videos from each condition and 3 training videos for a  user.
function selectVideosForUser() {
  var trainingVideos = VideoPairs.find({type: "train", approved: true}).fetch();
  // sample 3 training pairs
  var selectedVideos = _.chain(trainingVideos).sample(3).value();
  totalTrainingData = _.size(selectedVideos);
  console.log(`total training data: ${totalTrainingData}`);
  // return _.first(selectedVideos, 1);

  // sample 2 test pairs from each dataset
  var testVideos = VideoPairs.find({type:"test", approved: true}).fetch();
  var videoGroups = _.groupBy(testVideos, "datasetId");
  _.each(_.keys(videoGroups), function(datasetId){
    var videosByDataset = videoGroups[datasetId];
    // Select 2 least voted videos from this dataset.
    var selectedFromDataset = _.chain(videosByDataset)
      .sortBy(function(pair) {
        let pairId = pair._id;
        return VideoPairVoteCount.findOne({pairId: pairId}).count
      })
      .first(2)
      .value()
    _.each(selectedFromDataset, function(pair) {selectedVideos.push(pair)});
  });
  var finalizedVideos = _.chain(selectedVideos).shuffle().value();
  return finalizedVideos;
};

function getNextVideoPair() {
  if(! videosForCurrentSession) {
    videosForCurrentSession = selectVideosForUser();
    //console.log("Selected Videos:");
    //console.log(videosForCurrentSession);
  }
  var total = _.size(videosForCurrentSession);
  console.log(`total: ${total}, at index: ${curIndex})`);

  if(curIndex == total) {
    curIndex = 0;
    currentPair = null;
    videosForCurrentSession = null;
    passedTrainingData = {};
    totalTrainingData = 0;
    return null;
  }

  var pair = videosForCurrentSession[curIndex];
  curIndex += 1;
  return pair;
};

function getVideoURL(wptId) {
  let url = `http://speedperception.instartlogic.com/${wptId}.gif`;
  return url;
};

function saveResult(comp) {
  var curTime = new Date().getTime();
  var viewingDuration = curTime - videoStartTime;

  console.log(currentPair, comp);

  Meteor.call('testResults.insert',
    {
      pairId: currentPair._id,
      session: Session.get('userSessionKey'),
      result: comp,
      viewDurationInMS: viewingDuration,
      repeatCount: replayCount
    });
  if(currentPair.type == 'train'
     && currentPair.result == comp) {
    passedTrainingData[currentPair._id] =1;
    console.log('passed training data:', _.size(passedTrainingData));
    _scoreDeps.changed();
    // showProgress();
  }

  // Show the visual response check modal after the 4th and 8th pair.
  if ( (curIndex == 4 && visualResponseCount < 2) ||
     (curIndex == 8 && visualResponseCount < 3)) {
    $('.visual-response-circle').css('background', 'black');
    $('#visual-response-modal').modal('show');
  }
}

function saveVisualResponse() {
  visualResponseCount++;
  var curTime = new Date().getTime();
  var latency = curTime - visualResponseStartTime;

  Meteor.call('visualResponse.insert',
    {
      session: Session.get('userSessionKey'),
      latencyInMS: latency
    });
}

function preloadGifs(url1, url2) {
  // Remove existing gif images.
  $('#loaderIcon').show();

  if($('#gifVideo1')) {
    $('#gifVideo1').attr('src', '');
  }
  if($('#gifVideo2')) {
    $('#gifVideo2').attr('src', '');
  }

  $('.first-gif').empty();
  $('.second-gif').empty();

  var firstGif = new Image();
  var secondGif = new Image();

  firstGif.src = url1;
  secondGif.src = url2;

  var numLoaded = 0;

  firstGif.onload = function() {syncGifLoad(firstGif);};
  secondGif.onload = function() {syncGifLoad(secondGif);};

  function syncGifLoad(video) {
    numLoaded++;

    if(numLoaded == 2) {
      console.log("Both loaded");
      $('#loaderIcon').hide();

      // Check for mobile device.
      if (Meteor.Device.isPhone()) {
        $(firstGif).attr('id', 'gifVideo1').addClass('height-responsive');
        $(secondGif).attr('id', 'gifVideo2').addClass('height-responsive');
      } else {
        $(firstGif).attr('id', 'gifVideo1').addClass('img-responsive');
        $(secondGif).attr('id', 'gifVideo2').addClass('img-responsive');
      }

      $('.first-gif').append($(firstGif));
      $('.second-gif').append($(secondGif));

      // start timer
      videoStartTime = new Date().getTime();

      numLoaded = 0;
    }
  };
};

function conclude() {
  $('#thanksModal').modal('show');
};

function isVerticalDisplayDevice() {
  return (Meteor.Device.isTablet() || Meteor.Device.isPhone());
}

// function showProgress() {
//   $('#scoreModal').modal('show');
// }

Template.abTest.helpers({
  isPhoneOrTablet: function() {
    return isVerticalDisplayDevice();
  }
});

Template.gifView.helpers({
  gifWidth: function() {
    if (Meteor.Device.isTablet()) {
      return "col-sm-6";
    } else if(Meteor.Device.isPhone()) {
      return "col-xs-100";
    } else {
      return "col-md-6";
    }
  }
});

Template.abTest.events({
  'click .show-next': function(e, t) {
    replayCount = 0;
    t.$('.btn-decision').prop('disabled', false).show();
    t.$('.show-next').prop('disabled', true);
    e.preventDefault();

    _progressDeps.changed();

    // remove current gifs
    currentPair = getNextVideoPair();
    if(_.isNull(currentPair)) {
      // Done showing all pairs.
      conclude();
      return;
    }
    preloadGifs(
      getVideoURL(currentPair.wptId_1),
      getVideoURL(currentPair.wptId_2)
      );
  },

  'click .replay-btn': function(e, t) {
    replayCount++;
    t.$('.btn-decision').prop('disabled', false).show();
    t.$('.show-next').prop('disabled', true);
    e.preventDefault();
    var first = $('#gifVideo1').attr('src');
    var second = $('#gifVideo2').attr('src');
    //console.log(first, second);
    // Reset
    preloadGifs(first, second);
  },

  // Results
  'click .mid-btn': function(e, t) {
    t.$('.btn-decision').prop('disabled', true);
    t.$('.show-next').prop('disabled', false);
    t.$('.left-btn').hide();
    t.$('.right-btn').hide();

    e.preventDefault();
    saveResult(0);
  },

  'click .left-btn': function(e, t) {
    t.$('.btn-decision').prop('disabled', true);
    t.$('.show-next').prop('disabled', false);
    t.$('.mid-btn').hide();
    t.$('.right-btn').hide();

    e.preventDefault();
    saveResult(1);
  },

  'click .right-btn': function(e, t) {
    t.$('.btn-decision').prop('disabled', true);
    t.$('.show-next').prop('disabled', false);
    t.$('.mid-btn').hide();
    t.$('.left-btn').hide();

    e.preventDefault();
    saveResult(2);
  }
});

Template.abTest.onRendered(function(){

  $('#guideModal').on('hidden.bs.modal', function() {
    $('#user-info-modal').modal('show');
  });

  $('#user-info-modal').on('hidden.bs.modal', function() {
    // First visual response check.
    console.log('start playing videos');

    $('.visual-response-circle').css('background', 'black');
    $('#visual-response-modal').modal('show');
  });


  $('#visual-response-modal').on('shown.bs.modal', function() {
    console.log('Visual response modal shown');
    let delay = 4000;

    Meteor.setTimeout(function() {
      console.log('changing circle color');
      $('.visual-response').prop('disabled', false);
      $('.visual-response-circle').css('background', 'blue');
      visualResponseStartTime = new Date().getTime();
    }, delay);
  });

  $('#visual-response-modal').on('hidden.bs.modal', function() {
    console.log('Visual response modal hidden');
    $('.visual-response').prop('disabled', true);
    $('.visual-response-circle').css('background', 'black');
    if(curIndex == 0) {
      // First time visual response check.
      Meteor.setTimeout(function(){
        currentPair = getNextVideoPair();
        preloadGifs(
          getVideoURL(currentPair.wptId_1),
          getVideoURL(currentPair.wptId_2));
      }, 1000);
    }
  });

  $('#guideModal').modal('show');

  $('.show-next').prop('disabled', true);
  $('.visual-response').prop('disabled', true);

  curIndex = 0;
  visualResponseCount = 0;
  // Generate a random hash for this user and store in session
  Session.set('userSessionKey', Random.id());

  // Reset session every 15 minutes.
  this.refresh_session = setInterval(function(){
    Session.set('userSessionKey', Random.id());
  }, 20*60*1000);
});

Template.abTest.onDestroyed(function(){
  clearInterval(this.refresh_session);
});


/* Template: modal dialogs */
Template.guide_modal.events({
  'click .start-play': function(e, t) {
    e.preventDefault();
    t.$('#guideModal').modal('hide');
  }
});

Template.user_info_modal.events({
  'click .continue-play': function(e, t) {
    e.preventDefault();
    console.log("Collecting user info!");
    let gender = t.$('#gender').val();
    let age = t.$('#age').val();
    let occupation = t.$('#occupation').val();
    console.log(Session.get('userSessionKey'), gender, age, occupation);
    Meteor.call('userInfo.insert', gender, age, occupation, Session.get('userSessionKey'));

    t.$('#user-info-modal').modal('hide');
  }
});

Template.thanks_modal.helpers({
  success_percent: function() {
    _scoreDeps.depend();
    //console.log(_.size(passedTrainingData), totalTrainingData);
    return Math.ceil((_.size(passedTrainingData)*100)/totalTrainingData);
  }
});

Template.thanks_modal.events({
  'click .stop-play': function(e, t) {
    e.preventDefault();
    playAgain = false;
    t.$('#thanksModal').modal('hide');
  },

  'click .play-again': function(e, t) {
    e.preventDefault();
    playAgain = true;
    t.$('#thanksModal').modal('hide');
  },

  'click .send-feedback': function(e, t) {
    e.preventDefault();
    // feedback
    var feedback = t.$('#feedback-text').val();
    t.$('#feedback-text').prop('disabled', true);
    t.$('.send-feedback').prop('disabled', true);
    if(feedback && feedback.length > 3) {
      Meteor.call('feedbacks.insert', feedback, Session.get('userSessionKey'));
    }
    // t.$('#thanksModal').modal('hide');
  }
});

Template.thanks_modal.onRendered(function() {
  $('#thanksModal').on('hidden.bs.modal', function() {
    if (playAgain) {
      document.location.reload(true);
    } else {
      Router.go('/');
    }
  });
});

Template.score_modal.helpers({
  success_percent: function() {
    _scoreDeps.depend();
    //console.log(_.size(passedTrainingData), totalTrainingData);
    return Math.ceil((_.size(passedTrainingData)*100)/totalTrainingData);
  }
});

Template.score_modal.events({
  'click .score-button': function(e, t) {
    e.preventDefault();
    t.$('#scoreModal').modal('hide');
  }
});

Template.score_modal.onRendered(function(){
  $('#scoreModal').on('hidden.bs.modal', function(){
    $('.show-next').trigger('click');
  });
});

Template.progressbar.helpers({
  progress: function() {
    _progressDeps.depend();
    return Math.ceil(100*(curIndex - 1) / _.size(videosForCurrentSession));
  }
});

Template.instructions.helpers({
  isPhoneOrTablet: function() {
    return isVerticalDisplayDevice();
  }
});

// Visual Response Modal
Template.visual_response_modal.events({
  'click .visual-response': function(e, t) {
    e.preventDefault();
    // Register the timing.
    saveVisualResponse();
    t.$('#visual-response-modal').modal('hide');
  },

  'click .replay-visual': function(e, t) {
    t.$('.visual-response').prop('disabled', true);
    t.$('.visual-response-circle').css('background', 'black');
    let delay = 4000;

    Meteor.setTimeout(function() {
      console.log('changing circle color');
      $('.visual-response').prop('disabled', false);
      $('.visual-response-circle').css('background', 'blue');
      visualResponseStartTime = new Date().getTime();
    }, delay);
  }
});