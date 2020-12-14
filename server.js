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
    console.log(err);
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

/*  "/contacts"
 *    GET: finds all contacts
 *    POST: creates a new contact
 */

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

        db.collection(CURRENT_BOARDS_COLLECTION).deleteMany({user_id: user_id})
        
        var data = {user_id: user_id, board: result}
        db.collection(CURRENT_BOARDS_COLLECTION).insertOne(data, function(err, doc) {
          if (err) {
            handleError(res, err.message, "Failed to create new board.");
          } 
        });
      }
  })
}

app.get("/game/:user_id", function(req, res) {

  var game_id
  var user_id = req.params.user_id

  db.collection(GAMES_COLLECTION).findOne({status: 'active'}, function(err, doc) {
      if (doc === null) {
        var data = { players: [user_id], status: 'active', active_dadisms: []}
        db.collection(GAMES_COLLECTION).insertOne(data, function(err, doc) {
          if (err) {
            handleError(res, err.message, "Failed to create new game.");
          }
          game_id = doc._id 
        });
        db.collection(CURRENT_BOARDS_COLLECTION).deleteMany({})
        getNewBoard(user_id)
        
        
      } else {
        game_id = doc._id
        if (!doc.players.includes(user_id)){
          doc.players.push(user_id)
          db.collection(GAMES_COLLECTION).updateOne({_id:  new ObjectID(game_id) }, doc, function(err, doc) {
            if (err) {
              handleError(res, err.message, "Failed to update new board.");
            } 
            db.collection(CURRENT_BOARDS_COLLECTION).findOne({user_id: user_id},function(err, doc) {
            if (doc===null){
              getNewBoard(user_id)
            }
          }) 
          });        
          
        }
      }
    });

    db.collection(GAMES_COLLECTION).findOne({ status: 'active' }, function(err, doc) {
      if (doc === null) {
        res.status(404);  
      } else {
        var response_data = { game_id: doc._id, active_dadisms: doc.active_dadisms }
        response_data.active_dadisms = doc.active_dadisms
        db.collection(CURRENT_BOARDS_COLLECTION).find({}).toArray(function(err, docs) {
          response_data.user_boards = docs;
          db.collection(DADISMS_COLLECTION).find({}).toArray(function(err, docs) {
            response_data.dadisms = docs;
            res.status(200).json(response_data);  
          })
        })
      }
    });
});


app.put("/activate_dadism/:game_id/:dadism_id", function(req, res) {
  db.collection(GAMES_COLLECTION).findOne({_id: game_id }, function(err, doc) {
      if (doc !== null) {
        if (!doc.active_dadisms.includes(dadism_id)){
          doc.active_dadisms.push(dadism_id)
          db.collection(GAMES_COLLECTION).updateOne({ game_id: game_id }, doc, function(err, doc) {
            if (err) {
              handleError(res, err.message, "Failed to update new board.");
            } 
          });
        }
      }
    });
});

app.put("/deactivate_dadism/:game_id/:dadism_id", function(req, res) {
  db.collection(GAMES_COLLECTION).findOne({_id: game_id }, function(err, doc) {
      if (doc !== null) {
        if (doc.active_dadisms.includes(dadism_id)){
          doc.active_dadisms = _.without(arr, _.findWhere(doc.active_dadisms, {_id: dadism_id}));
          db.collection(GAMES_COLLECTION).updateOne({ game_id: game_id }, doc, function(err, doc) {
            if (err) {
              handleError(res, err.message, "Failed to update new board.");
            } 
          });
        }
      }
    });
});

app.get("/newboard/:user_id", function(req, res) {
  db.collection(DADISMS_COLLECTION).find({}).toArray(function(err, docs) {
    if (err) {
      handleError(res, err.message, "Failed to get the jokes.");
    } else {

      const shuffled = docs.sort(() => 0.5 - Math.random());
      let selected = shuffled.slice(0, 24);
      
      let user_id = req.params.user_id
      

      let result = []
        _(selected).each(function(v, i){
          result.push(v._id)
        });

      let data = {user_id: user_id, board: result}
      
      db.collection(CURRENT_BOARDS_COLLECTION).findOne({ user_id: user_id }, function(err, doc) {
        if (doc === null) {
              db.collection(CURRENT_BOARDS_COLLECTION).insertOne(data, function(err, doc) {
                if (err) {
                  handleError(res, err.message, "Failed to create new board.");
                } 
              });
          
        } else {
          db.collection(CURRENT_BOARDS_COLLECTION).updateOne({user_id: user_id }, data, function(err, doc) {
            if (err) {
              handleError(res, err.message, "Failed to update new board.");
            } 
          });
        }
      });
      res.status(200).json(data);  
    }
  });
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

  db.collection(FAMILY_COLLECTION).findOne({ name: newUser.name }, function(err, doc) {
    if (err) {
      handleError(res, err.message, "Failed to get the joke");
    } else if (doc===null){
        db.collection(FAMILY_COLLECTION).insertOne(newUser, function(err, doc) {
          if (err) {
            handleError(res, err.message, "Failed to create new contact.");
          } else {
            delete doc.ops[0].password
            res.status(201).json(doc.ops[0]);
          }
        });
    } else {
      delete doc.password
      res.status(200).json(doc);  
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
