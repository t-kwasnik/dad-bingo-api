var express = require("express");
var path = require("path");
var bodyParser = require("body-parser");
var mongodb = require("mongodb");
var ObjectID = mongodb.ObjectID;
var _ = require("underscore")

var DADISMS_COLLECTION = "dadisms";
var CURRENT_BOARDS_COLLECTION = "current_boards";
var ACTIVE_DADISMS_COLLECTION = "active_dadisms";
var GAMES_COLLECTION = "games";
var FAMILY_COLLECTION = "family";

var app = express();
app.use(express.static(__dirname + "/public"));
app.use(bodyParser.json());
app.use(function(req, res, next) {
  for (var key in req.query)
  { 
    req.query[key.toLowerCase()] = req.query[key];
  }
  next();
});
// Create a database variable outside of the database connection callback to reuse the connection pool in your app.
var db;

// Connect to the database before starting the application server. 
mongodb.MongoClient.connect(process.env.MONGODB_URI, function (err, database) {
  if (err) {
    process.exit(1);
  }

  // Save database object from the callback for reuse.
  db = database;
  console.log("Database connection ready");

  // Initialize the app.
  var server = app.listen(process.env.PORT || 8080, function () {
    var port = server.address().port;
    console.log("App now running on port", port);
  });
});

// CONTACTS API ROUTES BELOW

// Generic error handler used by all endpoints.
function handleError(res, reason, message, code) {
  console.log("ERROR: " + reason);
  res.status(code || 500).json({"error": message});
}

function checkBoard(board, active_dadisms) {
  var winning_patterns = [
    //COL
    [1,0,0,0,0,1,0,0,0,0,1,0,0,0,1,0,0,0,0,1,0,0,0,0],
    [0,1,0,0,0,0,1,0,0,0,0,1,0,0,0,1,0,0,0,0,1,0,0,0],
    [0,0,1,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,0,1,0,0],
    [0,0,0,1,0,0,0,0,1,0,0,0,1,0,0,0,0,1,0,0,0,0,1,0],
    [0,0,0,0,1,0,0,0,0,1,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
    //ROW
    [1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1],
    //X
    [1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,1],
    [0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0],
    //STAMP
    [1,1,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,1,1],
    [0,0,0,1,1,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,1,1,0,0,0],
    //DIAMOND
    [1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1],
    [0,0,0,0,0,0,0,1,0,0,0,1,1,0,0,0,1,0,0,0,0,0,0,0]
  ]
  
  var active_pattern = []
  _.each(board.board, function(b){
    if (active_dadisms.map(d=>d.toString()).includes(b.toString())){
      active_pattern.push(1)
    } else {
      active_pattern.push(0)  
    }
  })

  var win = false
  _.each(winning_patterns, function(pattern){
    var win_check = true
    _.each(pattern, function(cell, idx){
      if (cell === 1){        
        if (cell !== active_pattern[idx]) {
          win = false
        } 
      }
    })
    if (win_check===true) {
      win = true
    }
  })

  if (win === true) {
    return (active_pattern.reduce((a, b) => a + b, 0))
  } else {
    return (-1)
  }
}

function checkForWins(game_id, latest_dadism){
  db.collection(GAMES_COLLECTION).findOne({ _id: game_id }, function(err, doc) {
    var game = doc
    var active_dadisms = doc.active_dadisms
    let player_ids = []
    _.each(doc.players, function(p){
      player_ids.push( new ObjectID(p) )
      })
    
    db.collection(CURRENT_BOARDS_COLLECTION).find({user_id: {$in: player_ids}}).toArray(function(err, docs) {
      var winners = []
      _.each(docs, function(board){
        var win_score = checkBoard(board, active_dadisms)
        if (win_score > 0 ){
          winners.push(
            {user_id: board.user_id, win_score: win_score, winning_dadism: latest_dadism}
          )
        } 
      })

      var final_winners = null
      var high_score = 0
      _.each(winners, function(w){
        if (w.win_score > high_score) {
          final_winners = [w.user_id]
          high_score = w.win_score
        } else if (w.win_score === high_score){
          final_winners.push(w.user_id)
        }
      })

      if (final_winners !== null) {
        game.final_winners = final_winners
        db.collection(GAMES_COLLECTION).updateOne({_id: game_id}, game)
        _.each(final_winners, function(u){
          db.collection(FAMILY_COLLECTION).findOne({_id: new ObjectID(u)}, function(err, doc) {
            doc.wins = doc.wins + 1
            db.collection(FAMILY_COLLECTION).updateOne({_id: doc._id}, doc)
          })
        })
      }
    })
  })
}

function getNewBoard(user_id){
  db.collection(DADISMS_COLLECTION).find({}).toArray(function(err, docs) {
      if (err) {
        handleError(res, err.message, "Failed to get the jokes.");
      } else {
        const shuffled = docs.sort(() => 0.5 - Math.random());
        let board = shuffled.slice(0, 24);
        let result = []
        _(board).each(function(v, i){
          result.push(v._id)
        });
        db.collection(CURRENT_BOARDS_COLLECTION).deleteMany({user_id: new ObjectID(user_id)})
        var data = {user_id: new ObjectID(user_id), board: result}
        db.collection(CURRENT_BOARDS_COLLECTION).insertOne(data, function(err, doc) {
          if (err) {
            handleError(res, err.message, "Failed to create new board.");
          } 
        });
      }
  })
}

function joinGame(user_id){
  db.collection(GAMES_COLLECTION).findOne({status: 'active'}, function(err, doc) {
      if (err) {
        handleError(res, err.message, "Failed to get the jokes.");
      } else {
        if (doc===null){
          game = { active_dadisms: [], players: [user_id], status: "active", active_dadisms:[], player_resets: [{user_id: user_id, resets: 0}] }
          db.collection(GAMES_COLLECTION).insertOne(game);

        } else {
          doc.players.push(user_id)
          doc.player_resets.push({user_id: user_id, resets: 0})
          db.collection(GAMES_COLLECTION).updateOne({_id: doc._id}, doc, function(err, doc) {
            if (err) {
              handleError(res, err.message, "Failed to update new board.");
            }
          });
        }
      }
  })
}


function returnGame(game_id, res){
  db.collection(GAMES_COLLECTION).findOne({ _id: new ObjectID(game_id) }, function(err, doc) {
    if (doc === null) {
      res.status(404);  
    } else {
      var response_data = doc
      response_data.active_dadisms = doc.active_dadisms
      db.collection(CURRENT_BOARDS_COLLECTION).find({}).toArray(function(err, docs) {
        response_data.user_boards = docs;
        db.collection(DADISMS_COLLECTION).find({}).toArray(function(err, docs) {
          response_data.dadisms = docs;
          let player_names = []
          _.each(response_data.players, function(id){
              let __id = new ObjectID(id)
              player_names.push(__id)
              })
          db.collection(FAMILY_COLLECTION).find({_id: {$in:player_names }}).toArray(function(err, docs) {
            let player_names = []
            _.each(docs, function(doc){
              player_names.push({user_id: doc._id, name: doc.name})
              })
            response_data.players = player_names
            db.collection(FAMILY_COLLECTION)
                .find({}).sort({wins:-1}).limit(10).toArray(function(err, docs) {
                    if (err) {
                      handleError(res, err.message, "Failed to get the joke");
                    } else {
                      let leaderboard = []
                      _.each(docs, function(doc){
                        leaderboard.push({name: doc.name, wins: doc.wins})
                      })
                      response_data.leaderboard = leaderboard
                      res.status(200).json(response_data);      
                    }
                  })
              })
            })
          })
        }
      });
}

app.get("/game/:user_id", function(req, res) {
var game_id
var user_id = req.params.user_id
db.collection(GAMES_COLLECTION).findOne({status: 'active'}, function(err, doc) {
    if (doc === null) {
      game = { active_dadisms: [], players: [user_id], status: "active", active_dadisms:[], player_resets: [{user_id: user_id, resets: 0}] }
      db.collection(GAMES_COLLECTION).insertOne(game);
    } else {
      if (doc.players.map(user=>user.toString()).includes(user_id)==true) {
        returnGame(doc._id, res)  
      } else {
        handleError(res, err, "Player not in current game.");  
      }
    }
  });
});


app.post("/gamewins/:game_id", function(req, res) {
var game_id = req.params.user_id
var user_id = req.params.user_id
db.collection(GAMES_COLLECTION).findOne({status: 'active'}, function(err, doc) {
    if (doc === null) {
      handleError(res, null, "No current active game.");
    } else {
      if (doc.players.map(user=>user.toString()).includes(user_id)==true) {
        returnGame(doc._id, res)  
      } else {
        handleError(res, err, "Player not in current game.");  
      }
      
    }
  });
});


app.put("/activate_dadism/:game_id/:dadism_id", function(req, res) {
  var game_id = new ObjectID(req.params.game_id)
  var dadism_id = req.params.dadism_id
  db.collection(GAMES_COLLECTION).findOne({_id: game_id }, function(err, doc) {
      if (doc !== null) {
        if (!doc.active_dadisms.map(a=>a.toString()).includes(dadism_id)){
          doc.active_dadisms.push(dadism_id)
          db.collection(GAMES_COLLECTION).updateOne({ _id: game_id }, doc, function(err, doc) {
            if (err) {
              handleError(res, err.message, "Failed to update new board.");
            }
            checkForWins(game_id, dadism_id)
              res.status(200).json({'success':true, dadism_id: dadism_id});      
        });
        }
        res.status(200).json({'success':true, dadism_id: dadism_id});
      }
    });
  });


app.put("/deactivate_dadism/:game_id/:dadism_id", function(req, res) {
  var game_id = new ObjectID(req.params.game_id)
  var dadism_id = req.params.dadism_id
  db.collection(GAMES_COLLECTION).findOne({_id: game_id }, function(err, doc) {
      if (doc !== null) {
        if (doc.active_dadisms.includes(dadism_id)){
          new_active_dadism = []
          _(doc.active_dadisms).each(function(dadism, i){
              if (dadism !== dadism_id){
                new_active_dadism.push(dadism)
              } 
                  
          });
          doc.active_dadisms=new_active_dadism
          db.collection(GAMES_COLLECTION).updateOne({ _id: game_id }, doc, function(err, doc) {
            if (err) {
              handleError(res, err.message, "Failed to update new board.");
            } 
            res.status(200).json({});   
          });
        }
      }
    });
});

app.get("/newboard/:user_id", function(req, res) {
  var user_id = req.params.user_id

  db.collection(GAMES_COLLECTION).findOne({ status: "active"}, function(err, doc) {
    
    const current_game = doc
    let number_resets = _.where(doc.player_resets.map(function (pr) { return {user_id: pr.user_id.toString(), resets: pr.resets }}), {user_id: user_id})[0].resets
    if (number_resets < 5) {
      db.collection(DADISMS_COLLECTION).find({}).toArray(function(err, docs) {
        if (err) {
          handleError(res, err.message, "Failed to get the jokes.");
        } else {
          const shuffled = docs.sort(() => 0.5 - Math.random());
          let selected = shuffled.slice(0, 24);
          let result = []
            _(selected).each(function(v, i){
              result.push(v._id)
            });
          let data = {user_id: new ObjectID(user_id), board: result}
          db.collection(CURRENT_BOARDS_COLLECTION).findOne({ user_id: new ObjectID(user_id) }, function(err, doc) {
            if (doc === null) {
                  db.collection(CURRENT_BOARDS_COLLECTION).insertOne(data, function(err, doc) {
                    if (err) {
                      handleError(res, err.message, "Failed to create new board.");
                    } 
                  });
            } else {

              db.collection(CURRENT_BOARDS_COLLECTION).updateOne({user_id: new ObjectID(user_id) }, data, function(err, doc) {
                if (err) {
                  handleError(res, err.message, "Failed to update new board.");
                } else {
                  
                  let new_player_resets = []
                  _.each(current_game.player_resets, function(x) {
                    if (x.user_id.toString() === user_id) {
                      new_player_resets.push({user_id: x.user_id, resets: x.resets +1 })
                    }
                  })       
                  current_game.player_resets = new_player_resets           
                  db.collection(GAMES_COLLECTION).updateOne({_id: current_game._id}, current_game, function(err, doc) {
                    if (err) {
                      handleError(res, err.message, "Failed to update new board.");
                    }
                    res.status(200).json(data);  
                  });
                }
              });
            }
          });
          
        }
      });
  } else {
    handleError(res, err, "Number of resets reached.");
  }
})
});

app.get("/dadisms", function(req, res) {
  db.collection(DADISMS_COLLECTION).find({}).toArray(function(err, docs) {
    if (err) {
      handleError(res, err.message, "Failed to get the jokes.");
    } else {
      res.status(200).json(docs);  
    }
  });
});

app.post("/dadisms", function(req, res) {
  var newDadism = req.body;
  newDadism.createDate = new Date();

  db.collection(DADISMS_COLLECTION).insertOne(newDadism, function(err, doc) {
    if (err) {
      handleError(res, err.message, "Failed to create new contact.");
    } else {
      res.status(201).json(doc.ops[0]);
    }
  });
});

/*  "/contacts/:id"
 *    GET: find contact by id
 *    PUT: update contact by id
 *    DELETE: deletes contact by id
 */

app.get("/dadisms/:id", function(req, res) {
  db.collection(DADISMS_COLLECTION).findOne({ _id: new ObjectID(req.params.id) }, function(err, doc) {
    if (err) {
      handleError(res, err.message, "Failed to get the joke");
    } else {
      res.status(200).json(doc);  
    }
  });
});

app.put("/dadisms/:id", function(req, res) {
  var updateDoc = req.body;
  delete updateDoc._id;

  db.collection(CONTACTS_COLLECTION).updateOne({_id: new ObjectID(req.params.id)}, updateDoc, function(err, doc) {
    if (err) {
      handleError(res, err.message, "Failed to update dadism");
    } else {
      res.status(204).end();
    }
  });
});

app.delete("/dadisms/:id", function(req, res) {
  db.collection(CONTACTS_COLLECTION).deleteOne({_id: new ObjectID(req.params.id)}, function(err, result) {
    if (err) {
      handleError(res, err.message, "Failed to delete contact");
    } else {
      res.status(204).end();
    }
  });
});

app.post("/user", function(req, res) {
  var newUser = req.body;
  newUser.createDate = new Date();
  newUser.wins = 0;

  db.collection(FAMILY_COLLECTION).findOne({ name: newUser.name }, function(err, doc) {
    if (err) {
      handleError(res, err.message, "Failed to get the joke");
    } else if (doc===null){
        db.collection(FAMILY_COLLECTION).insertOne(newUser, function(err, doc) {
          if (err) {
            handleError(res, err.message, "Failed to create new contact.");
          } else {
            delete doc.ops[0].password
            getNewBoard(doc.ops[0]._id)
            joinGame(doc.ops[0]._id)
            res.status(201).json(doc.ops[0]);
          }
        });
    } else {
      res.status(500).json({'message':"Error"})
    }
  });
        
});

app.get("/login", function(req, res) {
  var user_name = req.query.user_name;
  var password = req.query.password;
  
  db.collection(FAMILY_COLLECTION).findOne({ name: user_name}, function(err, doc) {
    if (err) {
      res.status(404).json({'message':"Error"})
    } else if (doc===null){
        res.status(404).json({'message':"Bad Login Credentials"})
    } else {
      if ((password !== 'd@dbing0') && (password !== doc.password)) {
          res.status(404).json({'message':"Bad Login Credentials"})
      } else {
        delete doc.password
        res.status(200).json(doc);  
    }
    }
  })
})
    
/*  "/contacts/:id"
 *    GET: find contact by id
 *    PUT: update contact by id
 *    DELETE: deletes contact by id
 */

app.get("/user/:id", function(req, res) {
  db.collection(FAMILY_COLLECTION).findOne({ _id: new ObjectID(req.params.id) }, function(err, doc) {
    if (err) {
      handleError(res, err.message, "Failed to get the joke");
    } else {
      res.status(200).json(doc);  
    }
  });
});

app.put("/user/:id", function(req, res) {
  var updateDoc = req.body;
  delete updateDoc._id;

  db.collection(FAMILY_COLLECTION).updateOne({_id: new ObjectID(req.params.id)}, updateDoc, function(err, doc) {
    if (err) {
      handleError(res, err.message, "Failed to update dadism");
    } else {
      res.status(204).end();
    }
  });
});
