var express = require('express');
var serveStatic = require('serve-static');
var bodyParser = require('body-parser');
let fs = require('fs');
var path = require('path');
var request = require('request');
const cors = require('cors');

var app = express();
app.use(bodyParser.json());
app.use(serveStatic(path.join(__dirname, '../'), {'dotfiles' : 'allow'}));
app.use(cors());
app.options('*', cors());

const mongoose = require('mongoose');
const mongoDbUrl = 'mongodb://mongo-db:27017/umldiagramsdatabase';
mongoose.connect(mongoDbUrl, {useNewUrlParser: true, useUnifiedTopology: true});
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

var ClassDiagramSchema = new mongoose.Schema({
    maxPoints: Number,
    diagramName: String,
    points: {
        "maxLev": Number,
        "classNamePoint": Number,
        "classTypePoint": Number,
        "attributeNamePoint": Number,
        "attributeTypePoint": Number,
        "attributeFullPoint": Number,
        "methodNamePoint": Number,
        "methodTypePoint": Number,
        "methodFullPoint": Number,
        "methodParameterNamePoint": Number,
        "methodParameterTypePoint": Number,
        "methodParameterFullPoint": Number,
        "relationshipMultiplicityPoint": Number,
        "relationshipNamePoint": Number,
        "relationshipPoint": Number,
        "relationshipFullPoint": Number,
        "relationshipPartialPoint": Number
    },
    solution: { cells: [mongoose.Schema.Types.Mixed]}
});

var ClassDiagramExampleSchema = new mongoose.Schema({
    diagramName: String,
    graph: { cells: [mongoose.Schema.Types.Mixed] }
});

var ClassDiagram = mongoose.model('ClassDiagram', ClassDiagramSchema, 'classdiagramsolutions');

var ClassDiagramExamples = mongoose.model('ClassDiagramExample', ClassDiagramExampleSchema, 'classdiagramexamples');

class ErrorReplyMessage {
    constructor(errorMessage) {
        this.errorMessage = errorMessage;
    }
}

class ReplyMessage {
    constructor(logEntries, totalPoints, itemsEvaluations, maxPoints) {
        this.totalPoints = totalPoints;
        this.itemsEvaluations = itemsEvaluations;
        this.maxPoints = maxPoints;
    }
}

class ItemEvaluation {
    constructor(type, pointsAwarded, pointsMax, solution, proposal) {
        this.type = type;
        this.pointsAwarded = pointsAwarded;
        this.pointsMax = pointsMax;
        this.solution = solution;
        this.proposal = proposal;
    }
}

class LogEntry {
    constructor(solutionItem, consoleLog) {
        this.solutionItem = solutionItem;
        this.consoleLog = consoleLog;
    }
}

const levenshteinDistance = (str1 = '', str2 = '') => {
    const track = Array(str2.length + 1).fill(null).map(() =>
    Array(str1.length + 1).fill(null));
    for (let i = 0; i <= str1.length; i += 1) {
       track[0][i] = i;
    }
    for (let j = 0; j <= str2.length; j += 1) {
       track[j][0] = j;
    }
    for (let j = 1; j <= str2.length; j += 1) {
       for (let i = 1; i <= str1.length; i += 1) {
          const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
          track[j][i] = Math.min(
             track[j][i - 1] + 1, // deletion
             track[j - 1][i] + 1, // insertion
             track[j - 1][i - 1] + indicator, // substitution
          );
       }
    }
    return track[str2.length][str1.length];
};

function unique(array){
    return array.filter(function(el, index, arr) {
        return index === arr.indexOf(el);
    });
}

function composeSolutionCheckHtml(serverResponse) {

    var html = "Max points: " + serverResponse.maxPoints + "<br>Your points: " + serverResponse.totalPoints + "<br><br>";

    if (serverResponse.maxPoints == serverResponse.totalPoints) {
        return html;
    }

    var gradingItems = serverResponse.itemsEvaluations;

    var missingClasses = gradingItems.filter(function(item) {
        return item.type == "class name" && item.pointsAwarded == 0;
    });

    if (missingClasses.length > 0) {
        html = html + "Some classes are missing<br>"
    }

    var wrongClassNames = gradingItems.filter(function(item) {
        return item.type == "class type" && item.pointsAwarded == 0;
    });

    if (wrongClassNames.length > 0) {
        html = html + "Some classes are of the wrong type.<br>"
    }

    var attributesErrors = gradingItems.filter(function(item) {

        var classIsFound = gradingItems.filter(function(itemsolution) {
            return itemsolution.type == "class name" 
            && itemsolution.pointsAwarded == itemsolution.pointsMax
            && itemsolution.solution == item.solution;
        })[0] || null;

        return classIsFound != null && item.type == "class attributes" && item.pointsAwarded == 0 && item.pointsMax != "N/A";
    });

    if (attributesErrors.length > 0) {

        var classesWithAttrErrors = attributesErrors.map(function(item) {
            return item.solution;
        }).join(", ");

        html = html + "You have not been given full points for attributes in classes <b>" + classesWithAttrErrors + "</b> (or one of its (de)normalized classes). Either attributes are missing or they are of the wrong type.<br><br>"; 
    }

    var methodssErrors = gradingItems.filter(function(item) {

        var classIsFound = gradingItems.filter(function(itemsolution) {
            return itemsolution.type == "class name" 
            && itemsolution.pointsAwarded == itemsolution.pointsMax
            && itemsolution.solution == item.solution;
        })[0] || null;

        return classIsFound != null && item.type == "class methods" && item.pointsAwarded == 0 && item.pointsMax != "N/A";
    });

    if (methodssErrors.length > 0) {

        var classesWithMethodErrors = methodssErrors.map(function(item) {
            return item.solution;
        }).join(", ");

        html = html + "You have not been given full points for methods in classes <b>" + classesWithMethodErrors + "</b> (or one of its (de)normalized classes). Either methods are missing, they have the wrong return type or their parameters have not been rewarded a full point (the parameters are missing, they are of the wrong type or there are too many parameters provided).<br><br>"; 
    }

    var relationshipStrict = gradingItems.filter(function(item) {
        return item.type == "solution relationships full point" && item.pointsAwarded == 0;
    })[0] || null;

    if (relationshipStrict != null) {
        html = html + "Some relationships could not be found with a direct comparison, so an indirect match had to be found or the relationship is missing.<br><br>";
    }

    var relationshipsNotFound = gradingItems.filter(function(item) {
        return item.type == "class relationship" && item.pointsAwarded == 0 && item.pointsMax != "N/A";
    });

    var numberOfRelationships = gradingItems.filter(function(item) {
        return item.type == "class relationship";
    });

    console.log("Number of relationships not found: " + relationshipsNotFound.length);
    console.log("Number of all relationships: " + numberOfRelationships.length);

    if (relationshipsNotFound.length > 0) {
        html = html + "You have not been given full points for relationships as some are not found even indirectly.<br><br>"; 
    }
    else if (relationshipsNotFound.length != numberOfRelationships.length){

        var relationshipsNamesErrors = gradingItems.filter(function(item) {
            return item.type == "class relationship name" && item.pointsAwarded == 0 && item.pointsMax != "N/A";
        });

        if (relationshipsNamesErrors.length > 0) {
            html = html + "You have not been given full points for relationships names/titles as some are not correct.<br><br>"; 
        }

        var relationshipsMultiplicityErrors = gradingItems.filter(function(item) {
            return item.type == "class relationship multiplicity" && item.pointsAwarded == 0 && item.pointsMax != "N/A";
        });

        if (relationshipsMultiplicityErrors.length > 0) {
            html = html + "You have not been given full points for relationships multiplicity/cardinality as some are not correct or missing.<br><br>"; 
        }
    }

    return html;
}

app.get('/hello', function (req, res) {
    res.send('Hello World, testing Class diagrams');
})

app.get('/', function (req, res) {

	fs.readFile('../index.html', function (error, data) {
        if (error) {
            res.writeHead(404);
			console.log(error);
            res.write('File not found!');
        } else {
            res.writeHead(200, {
                'Content-Type': 'text/html'
            });
            res.write(data);
        }
        res.end();
    });

})

app.get('/ClassDiagram/Draw', function(req, res) {
    res.writeHead(200, {
        'Content-Type': 'text/html'
    });

    fs.readFile('../Diagrams/ClassDiagram/ClassDiagramDraw.html', function (error, data) {
        if (error) {
			console.log(error);
            res.write('File not found!');
        } else {
            res.write(data);
        }
        res.end();
    });
})

app.get('/ClassDiagram/Example', async function(req, res) {

    try {

        var inputDiagramName = req.query.exampleGraphName;
        
        var classDiagramExample = await ClassDiagramExamples.findOne({ diagramName: inputDiagramName }).exec();

        if (classDiagramExample == null) {
            var errorReplyMessage = new ErrorReplyMessage("DB does not contain an example class diagram with name " + diagramName);
            res.json(errorReplyMessage);
        }
        else {
            try {
                res.send(classDiagramExample.graph);
            }
            catch {
                var errorReplyMessage = new ErrorReplyMessage('Error while getting data from DB: ' + classDiagramExample);
                res.json(errorReplyMessage);
            }
        }
    }
    catch(e) {
        console.error("Exception: " + e);
        var errorReplyMessage = new ErrorReplyMessage("Exception: " + e);
        res.send(errorReplyMessage);
    }

})

app.post('/ClassDiagram/CompareToSolutionPrettyAnswer', async function(req, res) {

    var requestParameters = {
        uri: 'http://127.0.0.1:5000/ClassDiagram/CompareToSolution',
        body: JSON.stringify(req.body),
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    }
    request(requestParameters, function (error, response, body) {
        var serverReply;

        var PrettyAnswer;

        try {
            serverReply = JSON.parse(body);

            if (serverReply.errorMessage != null) {
                PrettyAnswer = "<b>The server returned an error message: </b>" + serverReply.errorMessage;
            }
            else {
                PrettyAnswer = composeSolutionCheckHtml(serverReply);
            }
        }
        catch {
            PrettyAnswer = "<b>An unexpected error has occurred when sending the request to the server: <b>" + body;
        }

        res.send(PrettyAnswer);
    });

})

app.post('/ClassDiagram/CompareToSolution', async function(req, res) {
    var totalPoints = 0;

    var logEntryArray = [];
    var itemEvaluationArray = [];

    var classTypes = ["uml.Class", "uml.Interface", "uml.Abstract"];
    var relationshipTypes = ["uml.Generalization", "uml.Implementation", "uml.Aggregation", "uml.Composition", "uml.Association"];

    var requestJson = req.body;
    var diagramName = requestJson.diagramName;

    var solutionDiagram;

    try {
        solutionDiagram = await ClassDiagram.findOne({ diagramName: diagramName }).exec();

        if (solutionDiagram == null) {
            var errorReplyMessage = new ErrorReplyMessage("DB does not contain a class diagram with name " + diagramName);
            res.json(errorReplyMessage);
            return;
        }
    }
    catch(e) {
        console.error("Exception: " + e);
        var errorReplyMessage = new ErrorReplyMessage('Error while getting data from DB: ' + err);
        res.json(errorReplyMessage);
        return;
    }

    var maxPoints = solutionDiagram.maxPoints;

    var maxLev = solutionDiagram.points.maxLev;

    var classNamePoint = solutionDiagram.points.classNamePoint;
    var classTypePoint = solutionDiagram.points.classTypePoint;

    var attributeNamePoint = solutionDiagram.points.attributeNamePoint;
    var attributeTypePoint = solutionDiagram.points.attributeTypePoint;
    var attributeFullPoint = solutionDiagram.points.attributeFullPoint;

    var methodNamePoint = solutionDiagram.points.methodNamePoint;
    var methodTypePoint = solutionDiagram.points.methodTypePoint;
    var methodFullPoint = solutionDiagram.points.methodFullPoint;

    var methodParameterNamePoint = solutionDiagram.points.methodParameterNamePoint;
    var methodParameterTypePoint = solutionDiagram.points.methodParameterTypePoint;
    var methodParameterFullPoint = solutionDiagram.points.methodParameterFullPoint;

    var relationshipMultiplicityPoint = solutionDiagram.points.relationshipMultiplicityPoint;
    var relationshipNamePoint = solutionDiagram.points.relationshipNamePoint;
    var relationshipPoint = solutionDiagram.points.relationshipPoint;
    var relationshipFullPoint = solutionDiagram.points.relationshipFullPoint;
    var relationshipPartialPoint = solutionDiagram.points.relationshipPartialPoint;

    var postedSolutionGraph = solutionDiagram.solution.cells;
    var postedProposedSolution = requestJson.proposed.cells;

    function CheckForAttributeInGeneralizedClass(originClass, attribute, searchedIds, solutionClassName) {

        var generalizedClassesIds = postedProposedSolution.filter( function(item) {
            return item.type == "uml.Generalization" && item.source.id == originClass.id;
        }).map(function (item) {
            return item.target.id;
        });

        var generalizedClasses = postedProposedSolution.filter( function(item) {
            return classTypes.includes(item.type) && generalizedClassesIds.includes(item.id);
        });
    
        for (let generalizedClass of generalizedClasses) {
            console.log("Searching for attribute " + attribute.attributeName + " in class " + generalizedClass.name);
            if (!searchedIds.includes(generalizedClass.id)) {
    
                var thisClassAttributes = generalizedClass.attributesDefinition;
                
                for (let thisClassAttribute of thisClassAttributes) {

                    if (thisClassAttribute.attributeName == attribute.attributeName || levenshteinDistance(thisClassAttribute.attributeName, attribute.attributeName) <= maxLev) {
                        totalPoints += attributeNamePoint;

                        itemEvaluationArray.push(new ItemEvaluation("attribute name", attributeNamePoint, attributeNamePoint, solutionClassName + "->" + attribute.attributeName, generalizedClass.name + "->" + thisClassAttribute.attributeName));
                        attribute.isFound = true;

                        console.log("Plus point for attribute name (" + thisClassAttribute.attributeName + ") in recursive.");
                        if (attribute.attributeType == "undefined") {
                            
                            itemEvaluationArray.push(new ItemEvaluation("attribute type", 0, "N/A", solutionClassName + "->" + attribute.attributeName, generalizedClass.name + "->" + thisClassAttribute.attributeName));
                            return true;
                        }
                        else if (thisClassAttribute.attributeType == attribute.attributeType && thisClassAttribute.isArray == attribute.isArray) {
                            console.log("Plus point for attribute type (" + thisClassAttribute.attributeName + ") in recursive.");

                            itemEvaluationArray.push(new ItemEvaluation("attribute type", attributeTypePoint, attributeTypePoint, solutionClassName + "->" + attribute.attributeName, generalizedClass.name + "->" + thisClassAttribute.attributeName));

                            totalPoints += attributeTypePoint;
                            return true;
                        }
                        itemEvaluationArray.push(new ItemEvaluation("attribute type", 0, attributeTypePoint, solutionClassName + "->" + attribute.attributeName, generalizedClass.name + "->" + thisClassAttribute.attributeName));
                        return "partial";
                    }
                };
    
                searchedIds.push(generalizedClass.id);
            }
        };
    
        for (let generalizedClass of generalizedClasses) {
            var depthSearch = CheckForAttributeInGeneralizedClass(generalizedClass, attribute, searchedIds, solutionClassName);
            if (depthSearch != false) {
                return depthSearch;
            }
        };
    
        return false;
    }

    function CheckForMethodInGeneralizedClass(originClass, method, searchedIds, solutionClassName) {
        
        var generalizedClassesIds = postedProposedSolution.filter( function(item) {
            return item.type == "uml.Generalization" && item.source.id == originClass.id;
        }).map(function (item) {
            return item.target.id;
        });

        var generalizedClasses = postedProposedSolution.filter( function(item) {
            return classTypes.includes(item.type) && generalizedClassesIds.includes(item.id);
        });
    
        for (let generalizedClass of generalizedClasses) {
            console.log("Searching for method " + method.methodName + " in class " + generalizedClass.name);
            if (!searchedIds.includes(generalizedClass.id)) {
    
                var thisClassMethods = generalizedClass.methodsDefinition;
    
                for (let thisClassMethod of thisClassMethods) {
                    if (thisClassMethod.methodName == method.methodName || levenshteinDistance(thisClassMethod.methodName, method.methodName) <= maxLev) {
                        totalPoints += methodNamePoint;

                        itemEvaluationArray.push(new ItemEvaluation("method name", methodNamePoint, methodNamePoint, solutionClassName + "->" + method.methodName, generalizedClass.name + "->" + thisClassMethod.methodName));
                        method.isFound = true;

                        console.log("Plus point for method name (" + thisClassMethod.methodName + "). (recursive method)");

                        if (thisClassMethod.methodType == method.methodType && thisClassMethod.isArray == method.isArray) {
                            console.log("Plus point for method type (" + thisClassMethod.methodName + "). (recursive method)");
                            totalPoints += methodTypePoint;
                            itemEvaluationArray.push(new ItemEvaluation("method type", methodTypePoint, methodTypePoint, solutionClassName + "->" + method.methodName, generalizedClass.name + "->" + thisClassMethod.methodName));
                        }
                        else {
                            itemEvaluationArray.push(new ItemEvaluation("method type", 0, methodTypePoint, solutionClassName + "->" + method.methodName, generalizedClass.name + "->" + thisClassMethod.methodName));
                        }
                        if (method.methodParameters == null || method.methodParameters.length == 0) {
                            if (thisClassMethod.methodParameters == null || thisClassMethod.methodParameters.length == 0) {
                                totalPoints += methodParameterFullPoint;
                                console.log("Plus point for no parameters in method. (recursive method)");
                                itemEvaluationArray.push(new ItemEvaluation("method parameters", methodParameterFullPoint, methodParameterFullPoint, solutionClassName + "->" + method.methodName, generalizedClass.name + "->" + thisClassMethod.methodName));
                                if (thisClassMethod.methodType == method.methodType && thisClassMethod.isArray == method.isArray) {
                                    return true;
                                }
                            }
                            else {
                                itemEvaluationArray.push(new ItemEvaluation("method parameters", 0, methodParameterFullPoint, solutionClassName + "->" + method.methodName, generalizedClass.name + "->" + thisClassMethod.methodName));
                                console.log("Empty point for extra parameters in method. (recursive method)");
                            }
                        }
                        else {

                            var solutionMethodParams = method.methodParameters;

                            var thisMethodParams = thisClassMethod.methodParameters;

                            solutionMethodParams.forEach(solutionMethodParam => {

                                var methodParamContained = thisMethodParams.filter(function (item) {
                                    return item.attributeName == solutionMethodParam.attributeName || levenshteinDistance(item.attributeName, solutionMethodParam.attributeName) <= maxLev;
                                })[0] || null;

                                if (methodParamContained != null) {
                                    totalPoints += methodParameterNamePoint;
                                    itemEvaluationArray.push(new ItemEvaluation("method parameter name", methodParameterNamePoint, methodParameterNamePoint, solutionClassName + "->" + method.methodName + "->" + solutionMethodParam.attributeName, generalizedClass.name + "->" + thisClassMethod.methodName + "->" + methodParamContained.attributeName));
                                    console.log("Plus point for method param name (" + methodParamContained.attributeName + "). (recursive method)");
                                    if (solutionMethodParam.attributeType == "undefined") {
                                        itemEvaluationArray.push(new ItemEvaluation("method parameter type", 0, "N/A", solutionClassName + "->" + method.methodName + "->" + solutionMethodParam.attributeName, generalizedClass.name + "->" + thisClassMethod.methodName + "->" + methodParamContained.attributeName));
                                        solutionMethodParam.isOk = true;
                                    }
                                    else if (methodParamContained.attributeType == solutionMethodParam.attributeType && methodParamContained.isArray == solutionMethodParam.isArray) {
                                        totalPoints += methodParameterTypePoint;
                                        itemEvaluationArray.push(new ItemEvaluation("method parameter type", methodParameterTypePoint, methodParameterTypePoint, solutionClassName + "->" + method.methodName + "->" + solutionMethodParam.attributeName, generalizedClass.name + "->" + thisClassMethod.methodName + "->" + methodParamContained.attributeName));
                                        console.log("Plus point for method param type (" + methodParamContained.attributeName + "). (recursive method)");
                                        solutionMethodParam.isOk = true;
                                    }
                                    else {
                                        itemEvaluationArray.push(new ItemEvaluation("method parameter type", 0, methodParameterTypePoint, solutionClassName + "->" + method.methodName + "->" + solutionMethodParam.attributeName, generalizedClass.name + "->" + thisClassMethod.methodName + "->" + methodParamContained.attributeName));
                                        solutionMethodParam.isOk = false;
                                    }
                                }
                                else {
                                    itemEvaluationArray.push(new ItemEvaluation("method parameter type", 0, methodParameterTypePoint, solutionClassName + "->" + method.methodName + "->" + solutionMethodParam.attributeName, generalizedClass.name + "->" + thisClassMethod.methodName));
                                    itemEvaluationArray.push(new ItemEvaluation("method parameter name", 0, methodParameterNamePoint, solutionClassName + "->" + method.methodName + "->" + solutionMethodParam.attributeName, generalizedClass.name + "->" + thisClassMethod.methodName));
                                }
                            });

                            var okParams = solutionMethodParams.filter(function(item) {
                                return item.isOk == true;
                            }).length;

                            if (solutionMethodParams.length == thisMethodParams.length && okParams == solutionMethodParams.length) {
                                totalPoints += methodParameterFullPoint;
                                itemEvaluationArray.push(new ItemEvaluation("method parameters", methodParameterFullPoint, methodParameterFullPoint, solutionClassName + "->" + method.methodName, generalizedClass.name + "->" + thisClassMethod.methodName));
                                console.log("Plus point for all parameters (recursive method)");
                                if (method.methodType == thisClassMethod.methodType && method.isArray == thisClassMethod.isArray) {
                                    return true;
                                }
                            }
                            else {
                                itemEvaluationArray.push(new ItemEvaluation("method parameters", 0, methodParameterFullPoint, solutionClassName + "->" + method.methodName, generalizedClass.name + "->" + thisClassMethod.methodName));
                            }
                        }
                        return "partial";
                    }
                    
                };
    
            }

            searchedIds.push(generalizedClass.id);
        };

        for (let generalizedClass of generalizedClasses) {
            var depthSearch = CheckForMethodInGeneralizedClass(generalizedClass, method, searchedIds, solutionClassName);
            if (depthSearch != false) {
                return depthSearch;
            }
        };

        return false;
    }

    function CheckClasses(solutionGraph, proposedSolutionGraph) {
    
        var solutionClasses = solutionGraph.filter(function(item) {
            return classTypes.includes(item.type);
        });

        solutionClasses.forEach(solutionClass => {

            var similarClass = proposedSolutionGraph.filter(function(item) {
                return classTypes.includes(item.type) && (item.name == solutionClass.name || levenshteinDistance(item.name, solutionClass.name) <= maxLev);
            })[0] || null;
    
            if(similarClass != null) {

                solutionClass.isFound = true;
    
                totalPoints += classNamePoint;

                itemEvaluationArray.push(new ItemEvaluation("class name", classNamePoint, classNamePoint, solutionClass.name, similarClass.name));

                console.log("Plus point for found class name (" + similarClass.name + ").");
    
                if (similarClass.type == solutionClass.type) {
                    console.log("Plus point for class type (" + similarClass.name + ").");
                    totalPoints += classTypePoint;
                    itemEvaluationArray.push(new ItemEvaluation("class type", classTypePoint, classTypePoint, solutionClass.name, similarClass.name));
                }
                else {
                    itemEvaluationArray.push(new ItemEvaluation("class type", 0, classTypePoint, solutionClass.name, similarClass.name));
                }

                if (solutionClass.attributesDefinition == null || solutionClass.attributesDefinition.length == 0) {
                    itemEvaluationArray.push(new ItemEvaluation("class attributes", 0, "N/A", solutionClass.name));
                }
                else {

                    var similarClassAttributes = similarClass.attributesDefinition;

                    solutionClass.attributesDefinition.forEach(solutionAttribute => {

                        var similarAttribute = similarClassAttributes.filter(function(item) {
                            return item.attributeName == solutionAttribute.attributeName || levenshteinDistance(item.attributeName, solutionAttribute.attributeName) <= maxLev;
                        })[0] || null;

                        if (similarAttribute != null) {
                            totalPoints += attributeNamePoint;
                            itemEvaluationArray.push(new ItemEvaluation("attribute name", attributeNamePoint, attributeNamePoint, solutionClass.name + "->" + solutionAttribute.attributeName, similarClass.name + "->" + similarAttribute.attributeName));
                            console.log("Plus point for found attribute (solution name: " + solutionAttribute.attributeName + "; proposal name: " + similarAttribute.attributeName + ").");
                            solutionAttribute.isFound = true;
                            if (solutionAttribute.attributeType == "undefined") {
                                console.log("Attribute in solution does not have a type. Not adding point; marking as OK.");
                                itemEvaluationArray.push(new ItemEvaluation("attribute type", 0, "N/A", solutionClass.name + "->" + solutionAttribute.attributeName, similarClass.name + "->" + similarAttribute.attributeName));
                                solutionAttribute.isOk = true;
                            }
                            else if (similarAttribute.attributeType == solutionAttribute.attributeType && similarAttribute.isArray == solutionAttribute.isArray) {
                                console.log("Plus point for attribute type (" + similarAttribute.attributeName + ").");
                                itemEvaluationArray.push(new ItemEvaluation("attribute type", attributeTypePoint, attributeTypePoint, solutionClass.name + "->" + solutionAttribute.attributeName, similarClass.name + "->" + similarAttribute.attributeName));
                                totalPoints += attributeTypePoint;
                                solutionAttribute.isOk = true;
                            }
                            else {
                                itemEvaluationArray.push(new ItemEvaluation("attribute type", 0, attributeTypePoint, solutionClass.name + "->" + solutionAttribute.attributeName, similarClass.name + "->" + similarAttribute.attributeName));
                                solutionAttribute.isOk = false;
                            }
                        }
                        else {
                            var deepSearch = CheckForAttributeInGeneralizedClass(similarClass, solutionAttribute, [similarClass.id], solutionClass.name);
                            if (deepSearch == true) {
                                solutionAttribute.isOk = true;
                            }
                            else if (deepSearch == false){

                                var classAssociations = proposedSolutionGraph.filter(function (item) {
                                    return item.type == "uml.Association" && ((item.source.id == similarClass.id && item.target.id != similarClass.id) || (item.target.id == similarClass.id && item.source.id != similarClass.id));
                                });

                                if (classAssociations.length == 0) {
                                    itemEvaluationArray.push(new ItemEvaluation("attribute name", 0, attributeNamePoint, solutionClass.name + "->" + solutionAttribute.attributeName));
                                    itemEvaluationArray.push(new ItemEvaluation("attribute type", 0, attributeTypePoint, solutionClass.name + "->" + solutionAttribute.attributeName));
                                }
    
                                classAssociations.forEach(classAssociation => {
    
                                    if (classAssociation.source.id == similarClass.id) {
    
                                        var targetMultiplicity = classAssociation.labels.filter(function(item) {
                                            return item.labelPurpose == "targetMultiplicity";
                                        })[0].multiplicity;
    
                                        if ((targetMultiplicity.min == "0" || targetMultiplicity.min == "1") && (targetMultiplicity.max == "" || targetMultiplicity.max == "0" || targetMultiplicity.max == "1")) {
    
                                            var targetClass = proposedSolutionGraph.filter(function(item) {
                                                return (item.methodsDefinition == null || item.methodsDefinition.length == 0) && item.id == classAssociation.target.id;
                                            })[0] || null;
    
                                            if (targetClass != null) {

                                                var attributeInAssociation = targetClass.attributesDefinition.filter(function(item) {
                                                    return item.attributeName == solutionAttribute.attributeName || levenshteinDistance(item.attributeName, solutionAttribute.attributeName) <= maxLev;
                                                })[0] || null;
        
                                                if (attributeInAssociation != null) {
                                                    console.log("Plus point for found attribute (" + attributeInAssociation.attributeName + "). (association class)");
                                                    totalPoints += attributeNamePoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("attribute name", attributeNamePoint, attributeNamePoint, solutionClass.name + "->" + solutionAttribute.attributeName, targetClass.name + "->" + attributeInAssociation.attributeName));
                                                    solutionAttribute.isFound = true;
                                                    if (solutionAttribute.attributeType == "undefined") {
                                                        itemEvaluationArray.push(new ItemEvaluation("attribute type", 0, "N/A", solutionClass.name + "->" + solutionAttribute.attributeName, targetClass.name + "->" + attributeInAssociation.attributeName));
                                                        solutionAttribute.isOk = true;
                                                    }
                                                    else if (attributeInAssociation.attributeType == solutionAttribute.attributeType && attributeInAssociation.isArray == solutionAttribute.isArray) {
                                                        console.log("Plus point for attribute type (" + attributeInAssociation.attributeName + "). (association class)");
                                                        totalPoints += attributeTypePoint;
                                                        itemEvaluationArray.push(new ItemEvaluation("attribute type", attributeTypePoint, attributeTypePoint, solutionClass.name + "->" + solutionAttribute.attributeName, targetClass.name + "->" + attributeInAssociation.attributeName));
                                                        solutionAttribute.isOk = true;
                                                    }
                                                    else {
                                                        itemEvaluationArray.push(new ItemEvaluation("attribute type", 0, attributeTypePoint, solutionClass.name + "->" + solutionAttribute.attributeName, targetClass.name + "->" + attributeInAssociation.attributeName));
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    else {
                                        var sourceMultiplicity = classAssociation.labels.filter(function(item) {
                                            return item.labelPurpose == "sourceMultiplicity";
                                        })[0].multiplicity;
    
                                        if ((sourceMultiplicity.min == "0" || sourceMultiplicity.min == "1") && (sourceMultiplicity.max == "" || sourceMultiplicity.max == "0" || sourceMultiplicity.max == "1")) {
    
                                            var sourceClass = proposedSolutionGraph.filter(function(item) {
                                                return item.id == classAssociation.source.id;
                                            })[0];
    
                                            var attributeInAssociation = sourceClass.attributesDefinition.filter(function(item) {
                                                return item.attributeName == solutionAttribute.attributeName || levenshteinDistance(item.attributeName, solutionAttribute.attributeName) <= maxLev;
                                            })[0] || null;
    
                                            if (attributeInAssociation != null) {
                                                console.log("Plus point for found attribute (" + attributeInAssociation.attributeName + "). (association class)");
                                                totalPoints += attributeNamePoint;
                                                itemEvaluationArray.push(new ItemEvaluation("attribute name", attributeNamePoint, attributeNamePoint, solutionClass.name + "->" + solutionAttribute.attributeName, sourceClass.name + "->" + attributeInAssociation.attributeName));
                                                solutionAttribute.isFound = true;
                                                if (solutionAttribute.attributeType == "undefined") {
                                                    solutionAttribute.isOk = true;
                                                    itemEvaluationArray.push(new ItemEvaluation("attribute type", 0, "N/A", solutionClass.name + "->" + solutionAttribute.attributeName, sourceClass.name + "->" + attributeInAssociation.attributeName));
                                                }
                                                else if (attributeInAssociation.attributeType == solutionAttribute.attributeType && attributeInAssociation.isArray == solutionAttribute.isArray) {
                                                    console.log("Plus point for attribute type (" + attributeInAssociation.attributeName + "). (association class)");
                                                    totalPoints += attributeTypePoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("attribute type", attributeTypePoint, attributeTypePoint, solutionClass.name + "->" + solutionAttribute.attributeName, sourceClass.name + "->" + attributeInAssociation.attributeName));
                                                    solutionAttribute.isOk = true;
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("attribute type", 0, attributeTypePoint, solutionClass.name + "->" + solutionAttribute.attributeName, sourceClass.name + "->" + attributeInAssociation.attributeName));
                                                }
                                            }
                                        }
                                    }
    
                                });
                            }
                        }
                    });

                    var okAttributes = solutionClass.attributesDefinition.filter(function(item) {
                        return item.isOk == true;
                    }).length;

                    if (okAttributes == solutionClass.attributesDefinition.length) {
                        console.log("Plus point for all attributes.");
                        totalPoints += attributeFullPoint;
                        itemEvaluationArray.push(new ItemEvaluation("class attributes", attributeFullPoint, attributeFullPoint, solutionClass.name));
                    }
                    else {
                        itemEvaluationArray.push(new ItemEvaluation("class attributes", 0, attributeFullPoint, solutionClass.name));

                        var missingAttributes = solutionClass.attributesDefinition.filter(function(item) {
                            return item.isFound != true;
                        });

                        missingAttributes.forEach(missingAttribute => {
                            itemEvaluationArray.push(new ItemEvaluation("attribute name", 0, attributeNamePoint, solutionClass.name + "->" + missingAttribute.attributeName));
                            itemEvaluationArray.push(new ItemEvaluation("attribute type", 0, attributeTypePoint, solutionClass.name + "->" + missingAttribute.attributeName));
                        });
                    }
                }

                if (solutionClass.methodsDefinition == null || solutionClass.methodsDefinition.length == 0) {
                    itemEvaluationArray.push(new ItemEvaluation("class methods", 0, "N/A", solutionClass.name));
                }
                else {
                    var similarClassMethods = similarClass.methodsDefinition;

                    solutionClass.methodsDefinition.forEach(solutionMethod => {

                        var similarMethod = similarClassMethods.filter(function(item) {
                            return item.methodName == solutionMethod.methodName || levenshteinDistance(item.methodName, solutionMethod.methodName) <= maxLev;
                        })[0] || null;

                        if (similarMethod != null) {
                            totalPoints += methodNamePoint;
                            itemEvaluationArray.push(new ItemEvaluation("method name", methodNamePoint, methodNamePoint, solutionClass.name + "->" + solutionMethod.methodName, similarClass.name + "->" + similarMethod.methodName));
                            solutionMethod.isFound = true;
                            console.log("Plus point for found method (" + similarMethod.methodName + ").");

                            if(similarMethod.methodType == solutionMethod.methodType && similarMethod.isArray == solutionMethod.isArray) {
                                totalPoints += methodTypePoint;
                                itemEvaluationArray.push(new ItemEvaluation("method type", methodTypePoint, methodTypePoint, solutionClass.name + "->" + solutionMethod.methodName, similarClass.name + "->" + similarMethod.methodName));
                                console.log("Plus point for method type (" + similarMethod.methodName + ").");
                            }
                            else {
                                itemEvaluationArray.push(new ItemEvaluation("method type", 0, methodTypePoint, solutionClass.name + "->" + solutionMethod.methodName, similarClass.name + "->" + similarMethod.methodName));
                            }

                            if (solutionMethod.methodParameters == null || solutionMethod.methodParameters.length == 0) {
                                if (similarMethod.methodParameters == null || similarMethod.methodParameters.length == 0) {
                                    totalPoints += methodParameterFullPoint;
                                    if (solutionMethod.methodType == similarMethod.methodType && solutionMethod.isArray == similarMethod.isArray) {
                                        solutionMethod.isOk = true;
                                    }                                    
                                    itemEvaluationArray.push(new ItemEvaluation("method parameters", methodParameterFullPoint, methodParameterFullPoint, solutionClass.name + "->" + solutionMethod.methodName, similarClass.name + "->" + similarMethod.methodName));
                                    console.log("Plus point for no parameters in method.");
                                }
                                else {
                                    itemEvaluationArray.push(new ItemEvaluation("method parameters", 0, methodParameterFullPoint, solutionClass.name + "->" + solutionMethod.methodName, similarClass.name + "->" + similarMethod.methodName));
                                    console.log("No point for no parameters in method.");
                                }
                            }
                            else {
    
                                var solutionMethodParams = solutionMethod.methodParameters;
    
                                var thisMethodParams = similarMethod.methodParameters;
    
                                solutionMethodParams.forEach(solutionMethodParam => {
    
                                    var methodParamContained = thisMethodParams.filter(function (item) {
                                        return item.attributeName == solutionMethodParam.attributeName || levenshteinDistance(item.attributeName, solutionMethodParam.attributeName) <= maxLev;
                                    })[0] || null;
    
                                    if (methodParamContained != null) {
                                        totalPoints += methodParameterNamePoint;
                                        itemEvaluationArray.push(new ItemEvaluation("parameter name", methodParameterNamePoint, methodParameterNamePoint, solutionClass.name + "->" + solutionMethod.methodName + "->" + solutionMethodParam.attributeName, similarClass.name + "->" + similarMethod.methodName + "->" + methodParamContained.attributeName));
                                        console.log("Plus point for found parameter (" + methodParamContained.attributeName + ").");
                                        if (solutionMethodParam.attributeType == "undefined") {
                                            solutionMethodParam.isOk = true;
                                            itemEvaluationArray.push(new ItemEvaluation("parameter type", 0, "N/A", solutionClass.name + "->" + solutionMethod.methodName + "->" + solutionMethodParam.attributeName, similarClass.name + "->" + similarMethod.methodName + "->" + methodParamContained.attributeName));
                                        }
                                        else if (methodParamContained.attributeType == solutionMethodParam.attributeType && methodParamContained.isArray == solutionMethodParam.isArray) {
                                            console.log("Plus point for parameter type (" + methodParamContained.attributeName + ").");
                                            totalPoints += methodParameterTypePoint;
                                            itemEvaluationArray.push(new ItemEvaluation("parameter type", methodParameterTypePoint, methodParameterTypePoint, solutionClass.name + "->" + solutionMethod.methodName + "->" + solutionMethodParam.attributeName, similarClass.name + "->" + similarMethod.methodName + "->" + methodParamContained.attributeName));

                                            solutionMethodParam.isOk = true;
                                        }
                                        else {
                                            itemEvaluationArray.push(new ItemEvaluation("parameter type", 0, methodParameterTypePoint, solutionClass.name + "->" + solutionMethod.methodName + "->" + solutionMethodParam.attributeName, similarClass.name + "->" + similarMethod.methodName + "->" + methodParamContained.attributeName));
                                            solutionMethodParam.isOk = false;
                                        }
                                    }
                                    else {
                                        itemEvaluationArray.push(new ItemEvaluation("parameter type", 0, methodParameterTypePoint, solutionClass.name + "->" + solutionMethod.methodName + "->" + solutionMethodParam.attributeName));
                                        itemEvaluationArray.push(new ItemEvaluation("parameter name", 0, methodParameterNamePoint, solutionClass.name + "->" + solutionMethod.methodName + "->" + solutionMethodParam.attributeName));
                                    }
                                });
    
                                var okParams = solutionMethodParams.filter(function(item) {
                                    return item.isOk == true;
                                }).length;
    
                                if (solutionMethodParams.length == thisMethodParams.length && okParams == solutionMethodParams.length) {
                                    console.log("Plus point for all parameters.");
                                    totalPoints += methodParameterFullPoint;
                                    itemEvaluationArray.push(new ItemEvaluation("method parameters", methodParameterFullPoint, methodParameterFullPoint, solutionClass.name + "->" + solutionMethod.methodName, similarClass.name + "->" + similarMethod.methodName));
                                    if (solutionMethod.methodType == similarMethod.methodType && solutionMethod.isArray == similarMethod.isArray) {
                                        solutionMethod.isOk = true;
                                    }
                                }
                                else {
                                    itemEvaluationArray.push(new ItemEvaluation("method parameters", 0, methodParameterFullPoint, solutionClass.name + "->" + solutionMethod.methodName, similarClass.name + "->" + similarMethod.methodName));
                                }
                            }
                        }
                        else {
                            var depthSearch = CheckForMethodInGeneralizedClass(similarClass, solutionMethod, [similarClass.id], solutionClass.name);
                            if (depthSearch == true) {
                                solutionMethod.isOk = true;
                            }
                        }

                    });

                    var okMethods = solutionClass.methodsDefinition.filter(function(item) {
                        return item.isOk == true;
                    }).length;

                    if (okMethods == solutionClass.methodsDefinition.length) {
                        console.log("Plus point for all methods.");
                        totalPoints += methodFullPoint;
                        itemEvaluationArray.push(new ItemEvaluation("class methods", methodFullPoint, methodFullPoint, solutionClass.name, similarClass.name));
                    }
                    else {
                        itemEvaluationArray.push(new ItemEvaluation("class methods", 0, methodFullPoint, solutionClass.name, similarClass.name));
                    
                        var missingMethods = solutionClass.methodsDefinition.filter(function(item) {
                            return item.isFound != true;
                        });

                        missingMethods.forEach(missingMethod => {
                            itemEvaluationArray.push(new ItemEvaluation("method name", 0, methodNamePoint, solutionClass.name + "->" + missingMethod.methodName));
                            itemEvaluationArray.push(new ItemEvaluation("method type", 0, methodTypePoint, solutionClass.name + "->" + missingMethod.methodName));

                            itemEvaluationArray.push(new ItemEvaluation("method parameters", 0, methodParameterFullPoint, solutionClass.name + "->" + missingMethod.methodName));
                            
                            if (missingMethod.methodParameters != null) {
                                missingMethod.methodParameters.forEach(parameter => {
                                    itemEvaluationArray.push(new ItemEvaluation("parameter type", 0, methodParameterTypePoint, solutionClass.name + "->" + missingMethod.methodName + "->" + parameter.attributeName));
                                    itemEvaluationArray.push(new ItemEvaluation("parameter name", 0, methodParameterNamePoint, solutionClass.name + "->" + missingMethod.methodName + "->" + parameter.attributeName));
                                });
                            }
                        });
                    }
                }
    
            }
            else {
                solutionClass.isFound = false;
            }
        });

        var missedClasses = solutionGraph.filter(function(item) {
            return item.isFound == false 
            && classTypes.includes(item.type)
            && (item.attributesDefinition != null && item.attributesDefinition.length > 0)
            && (item.methodsDefinition.length == 0 || item.methodsDefinition == null);
        });

        missedClasses.forEach(missedClass => {

            console.log("Looking at missed class " + missedClass.name);

            var missedClassAssociations = solutionGraph.filter(function (item) {
                return item.type == "uml.Association" && ((item.source.id == missedClass.id && item.target.id != missedClass.id) || (item.target.id == missedClass.id && item.source.id != missedClass.id));
            });

            var sourceAssociations = missedClassAssociations.filter(function(item) {
                var sourceMultiplicity = item.labels.filter(function(item) {
                    return item.labelPurpose == "sourceMultiplicity";
                })[0].multiplicity;

                return item.source.id == missedClass.id
                && item.target.id != missedClass.id
                && (sourceMultiplicity.min == "0" || sourceMultiplicity.min == "1")
                && (sourceMultiplicity.max == "" || sourceMultiplicity.max == "0" || sourceMultiplicity.max == "1");
            });

            var targetAssociations = missedClassAssociations.filter(function(item) {

                var targetMultiplicity = item.labels.filter(function(item) {
                    return item.labelPurpose == "targetMultiplicity";
                })[0].multiplicity;

                return item.target.id == missedClass.id
                && item.source.id != missedClass.id
                && (targetMultiplicity.min == "0" || targetMultiplicity.min == "1")
                && (targetMultiplicity.max == "" || targetMultiplicity.max == "0" || targetMultiplicity.max == "1");
            });

            //is edge class only
            if (missedClassAssociations.length > 0 && sourceAssociations.length + targetAssociations.length == missedClassAssociations.length) {

                var sourceAssociationsClassIds = sourceAssociations.map(function(item) {
                    return item.target.id;
                });

                var targetAssociationsClassIds = targetAssociations.map(function(item) {
                    return item.source.id;
                });

                var mergedOtherClassIds = unique(sourceAssociationsClassIds.concat(targetAssociationsClassIds));

                var otherClassesNames = solutionGraph.filter(function(item) {
                    return classTypes.includes(item.type) && mergedOtherClassIds.includes(item.id);
                }).map(function(item) {
                    return item.name;
                });

                var classesToDeleteRelationshipNames = [];

                var proposedOtherClasses = proposedSolutionGraph.filter(function(item) {

                    for (let otherClassName of otherClassesNames) {
                        if (classTypes.includes(item.type) && (item.name == otherClassName || levenshteinDistance(item.name, otherClassName) <= maxLev)) {
                            classesToDeleteRelationshipNames.push(otherClassName);
                            return true;
                        }
                    }

                    return false;
                });

                var allFound = true;

                var dictOfAttrs = new Object();

                if (proposedOtherClasses.length == 0) {
                    allFound = false;
                }
                else {
                    //check that all these classes contain all attributes from the edge class
                    for (let proposedOtherClass of proposedOtherClasses) {

                        console.log("Searching class " + proposedOtherClass.name + " for attributes.");

                        for (let attrToFind of missedClass.attributesDefinition) {

                            var attrToFindInProposed = proposedOtherClass.attributesDefinition.filter(function(item) {
                                return item.attributeName == attrToFind.attributeName || levenshteinDistance(item.attributeName, attrToFind.attributeName) <= maxLev;
                            })[0] || null;

                            if (attrToFindInProposed == null) {
                                console.log("Couldn't find attribute with name " + attrToFind.attributeName + " in class " + proposedOtherClass.name + ".");
                                allFound = false;
                                break;
                            }
                            else {
                                if (attrToFind.attributeType != "undefined" && (attrToFind.attributeType != attrToFindInProposed.attributeType || attrToFind.isArray != attrToFindInProposed.isArray)) {
                                    console.log("Found attribute " + attrToFindInProposed.attributeName + " but it has a different type (" + attrToFindInProposed.attributeType + ") than the one we are searching for (" + attrToFind.attributeType + ").");
                                    allFound = false;
                                    break;
                                }

                                if (dictOfAttrs[attrToFind.attributeName] === undefined) {
                                    dictOfAttrs[attrToFind.attributeName] = proposedOtherClass.name + "->" + attrToFindInProposed.attributeName;
                                }
                                else {
                                    dictOfAttrs[attrToFind.attributeName] = dictOfAttrs[attrToFind.attributeName] + ";" + proposedOtherClass.name + "->" + attrToFindInProposed.attributeName;
                                }

                            }

                        }

                        if (allFound == false) {
                            console.log("Stop searching for other attributes in proposed class " + proposedOtherClass.name + ".");
                            break;
                        }

                    }
                }

                if (allFound == true) {
                    console.log("All attributes for missing class " + missedClass.name + " are found in every existing connecting class in the proposal. Adding points");

                    //add points for class

                    totalPoints += classNamePoint;
                    console.log("Plus point for class name");
                    itemEvaluationArray.push(new ItemEvaluation("class name", classNamePoint, classNamePoint, missedClass.name, proposedOtherClasses.map(function(item) { return item.name}).join()));
                    totalPoints += classTypePoint;
                    console.log("Plus point for class type");
                    itemEvaluationArray.push(new ItemEvaluation("class type", classNamePoint, classNamePoint, missedClass.name, proposedOtherClasses.map(function(item) { return item.name}).join()));

                    totalPoints += attributeNamePoint * missedClass.attributesDefinition.length;
                    console.log("Plus point for attributes names ( x" + missedClass.attributesDefinition.length + ")");

                    totalPoints += attributeTypePoint * missedClass.attributesDefinition.length;
                    console.log("Plus point for attributes types ( x" + missedClass.attributesDefinition.length + ")");
                    
                    for (let attrToFind of missedClass.attributesDefinition) {
                        itemEvaluationArray.push(new ItemEvaluation("attribute name", attributeNamePoint, attributeNamePoint, missedClass.name + "->" + attrToFind.attributeName, dictOfAttrs[attrToFind.attributeName]));
                        attrToFind.isFound = true;
                        itemEvaluationArray.push(new ItemEvaluation("attribute type", attributeTypePoint, attributeTypePoint, missedClass.name + "->" + attrToFind.attributeName, dictOfAttrs[attrToFind.attributeName]));
                    }
                    
                    totalPoints += attributeFullPoint;
                    console.log("Plus full point for attributes");
                    itemEvaluationArray.push(new ItemEvaluation("class attributes", attributeFullPoint, attributeFullPoint, missedClass.name));

                    console.log("Empty point for no methods");
                    itemEvaluationArray.push(new ItemEvaluation("class methods", 0, "N/A", missedClass.name));
                    
                    classesToDeleteRelationshipNames.forEach(classToDeleteRelationshipName => {
                        
                        var classToDeleteRelationship = solutionGraph.filter(function(item) {
                            return classTypes.includes(item.type) && item.name == classToDeleteRelationshipName;
                        }).map(function(item) {
                            return item.id;
                        });

                        var relationshipsToDelete = solutionGraph.filter(function(item) {
                            return item.type == "uml.Association"
                            && ((item.source.id == missedClass.id && classToDeleteRelationship.includes(item.target.id)) || (item.target.id == missedClass.id && classToDeleteRelationship.includes(item.source.id)));
                        });

                        relationshipsToDelete.forEach(relationshipToDelete => {

                            //remove association from solution and add points for relationship

                            var theOtherClass = solutionGraph.filter(function(item) {
                                return classTypes.includes(item.type) 
                                && ((relationshipToDelete.source.id == missedClass.id && relationshipToDelete.target.id == item.id) ||
                                (relationshipToDelete.target.id == missedClass.id && relationshipToDelete.source.id == item.id))
                            })[0] || null;

                            var relationshipToDeleteName = relationshipToDelete.labels.filter(function(item) {
                                return item.labelPurpose == "relationshipName";
                            })[0].attrs.text.text;

                            totalPoints += relationshipPoint;
                            console.log("Plus point for relationship");

                            itemEvaluationArray.push(new ItemEvaluation("class relationship", relationshipPoint, relationshipPoint, missedClass.name + "->" + theOtherClass.name + "(" + `${relationshipToDeleteName}` + ";uml.Association)", theOtherClass.name));

                            totalPoints += relationshipNamePoint;
                            console.log("Plus point for relationship name");

                            itemEvaluationArray.push(new ItemEvaluation("class relationship name", relationshipNamePoint, relationshipNamePoint, missedClass.name + "->" + theOtherClass.name + "(" + `${relationshipToDeleteName}` + ";uml.Association)", theOtherClass.name));

                            totalPoints += relationshipMultiplicityPoint * 2;
                            console.log("Plus point for relationship multiplicity ( x2)");

                            itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, missedClass.name + "->" + theOtherClass.name + "(" + `${relationshipToDeleteName}` + ";uml.Association)", theOtherClass.name));

                            relationshipToDelete.isRemoved = true;
                        });

                    });

                    missedClass.isFound = true;

                }

            }

        });

        var notFoundClasses = solutionGraph.filter(function(item) {
            return item.isFound != true 
            && classTypes.includes(item.type);
        });

        notFoundClasses.forEach(notFoundClass => {

            itemEvaluationArray.push(new ItemEvaluation("class name", 0, classNamePoint, notFoundClass.name));
            itemEvaluationArray.push(new ItemEvaluation("class type", 0, classNamePoint, notFoundClass.name));
            itemEvaluationArray.push(new ItemEvaluation("class attributes", 0, attributeFullPoint, notFoundClass.name));

            notFoundClass.attributesDefinition.forEach(attribute => {
                itemEvaluationArray.push(new ItemEvaluation("attribute name", 0, attributeNamePoint, notFoundClass.name + "->" + attribute.attributeName));
                itemEvaluationArray.push(new ItemEvaluation("attribute type", 0, attributeTypePoint, notFoundClass.name + "->" + attribute.attributeName));
            });

            notFoundClass.methodsDefinition.forEach(method => {

                itemEvaluationArray.push(new ItemEvaluation("method name", 0, methodNamePoint, notFoundClass.name + "->" + method.methodName));
                itemEvaluationArray.push(new ItemEvaluation("method type", 0, methodTypePoint, notFoundClass.name + "->" + method.methodName));

                itemEvaluationArray.push(new ItemEvaluation("method parameters", 0, methodParameterFullPoint, notFoundClass.name + "->" + method.methodName));

                if (method.methodParameters != null) {
                    method.methodParameters.forEach(parameter => {
                        itemEvaluationArray.push(new ItemEvaluation("parameter type", 0, methodParameterTypePoint, notFoundClass.name + "->" + method.methodName + "->" + parameter.attributeName));
                        itemEvaluationArray.push(new ItemEvaluation("parameter name", 0, methodParameterNamePoint, notFoundClass.name + "->" + method.methodName + "->" + parameter.attributeName));
                    });
                }
            });

        });
    
    }

    function CheckRelationshipsStrict(solutionGraph, proposedSolutionGraph) {

        var solutionClasses = solutionGraph.filter(function(item) {
            return classTypes.includes(item.type) && item.isRemoved != true;
        });

        solutionClasses.forEach(solutionClass => {
            
            var solutionClassExitRelationships = solutionGraph.filter(function(item) {
                return relationshipTypes.includes(item.type) 
                && item.isRemoved != true
                && item.source.id == solutionClass.id;
            });

            solutionClassExitRelationships.forEach(solutionClassExitRelationship => {

                var proposalSourceClass = proposedSolutionGraph.filter(function(item) {
                    return classTypes.includes(item.type) && (item.name == solutionClass.name || levenshteinDistance(item.name, solutionClass.name) <= maxLev);
                })[0] || null;

                if (proposalSourceClass != null) {

                    var solutionTargetClass = solutionClasses.filter(function(item) {
                        return item.id == solutionClassExitRelationship.target.id;
                    })[0];
                    
                    var proposalTargetClass = proposedSolutionGraph.filter(function(item) {
                        return classTypes.includes(item.type) && (item.name == solutionTargetClass.name || levenshteinDistance(item.name, solutionTargetClass.name) <= maxLev);
                    })[0] || null;

                    if (proposalTargetClass != null) {

                        if (solutionClassExitRelationship.type == "uml.Association") {
    
                            var proposalClassRelationshipsToTarget = proposedSolutionGraph.filter(function(item) {
                                return item.type == solutionClassExitRelationship.type
                                && (
                                    (item.source.id == proposalSourceClass.id && item.target.id == proposalTargetClass.id) 
                                    || (item.target.id == proposalSourceClass.id && item.source.id == proposalTargetClass.id));
                            });
    
                            if (proposalClassRelationshipsToTarget == null || proposalClassRelationshipsToTarget.length == 0) {
                                console.log("No relationships between " + proposalSourceClass.name + " and " + proposalTargetClass.name + ".");
                            }
                            else if (proposalClassRelationshipsToTarget.length > 1) {

                                console.log("Has multiple associations");
    
                                var solutionRelationshipName = solutionClassExitRelationship.labels.filter(function(item) {
                                    return item.labelPurpose == "relationshipName";
                                })[0].attrs.text.text;
    
                                for (let proposalClassRelationshipToTarget of proposalClassRelationshipsToTarget) {
    
                                    var proposalRelationshipName = proposalClassRelationshipToTarget.labels.filter(function(item) {
                                        return item.labelPurpose == "relationshipName";
                                    })[0].attrs.text.text;
    
                                    if (solutionRelationshipName == proposalRelationshipName || levenshteinDistance(solutionRelationshipName, proposalRelationshipName) <= maxLev) {

                                        console.log("Plus point exact match (" + solutionRelationshipName + ") for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                        totalPoints += relationshipPoint;
                                        itemEvaluationArray.push(new ItemEvaluation("class relationship", relationshipPoint, relationshipPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                        
                                        console.log("Plus point for name in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                        totalPoints += relationshipNamePoint;
                                        itemEvaluationArray.push(new ItemEvaluation("class relationship name", relationshipNamePoint, relationshipNamePoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
    
                                        var solutionRelationshipSourceMultiplicity = solutionClassExitRelationship.labels.filter(function(item) {
                                            return item.labelPurpose == "sourceMultiplicity";
                                        })[0].multiplicity;
        
                                        var proposalRelationshipSourceMultiplicity = proposalClassRelationshipToTarget.labels.filter(function(item) {
                                            return item.labelPurpose == "sourceMultiplicity";
                                        })[0].multiplicity;
                
                                        var solutionRelationshipTargetMultiplicity = solutionClassExitRelationship.labels.filter(function(item) {
                                            return item.labelPurpose == "targetMultiplicity";
                                        })[0].multiplicity;
        
                                        var proposalRelationshipTargetMultiplicity = proposalClassRelationshipToTarget.labels.filter(function(item) {
                                            return item.labelPurpose == "targetMultiplicity";
                                        })[0].multiplicity;

                                        if (proposalTargetClass.id == proposalClassRelationshipToTarget.target.id) {

                                            if (solutionTargetClass.id = solutionClassExitRelationship.target.id) {

                                                if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                    console.log("Plus point for source multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;

                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                
                                                if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                    console.log("Plus point for target multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;

                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }

                                            }
                                            else {

                                                if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                    console.log("Plus point for source multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;

                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                
                                                if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                    console.log("Plus point for target multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;

                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }

                                            }

                                        }
                                        else {
                                            if (solutionTargetClass.id = solutionClassExitRelationship.target.id) {
                                                if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                    console.log("Plus point for source multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;

                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                
                                                if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                    console.log("Plus point for target multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;

                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                            }
                                            else {

                                                if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                    console.log("Plus point for source multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;

                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                
                                                if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                    console.log("Plus point for target multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;

                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }

                                            }
                                        }
            
                                        solutionClassExitRelationship.isFound = true;
                                        break;
                                    }
    
                                }
                            }
                            else {

                                var solutionAssociationsBetweenSameClasses = solutionGraph.filter(function(item) {
                                    return item.type == "uml.Association"
                                    && (
                                        (item.source.id == solutionTargetClass.id && item.target.id == solutionClass.id) 
                                        || (item.target.id == solutionTargetClass.id && item.source.id == solutionClass.id));
                                });
                                                    
                                if (solutionAssociationsBetweenSameClasses != null && solutionAssociationsBetweenSameClasses.length > 1) {

                                    proposalClassRelationshipsToTarget = proposalClassRelationshipsToTarget[0];
                                    
                                    var proposalRelationshipName = proposalClassRelationshipsToTarget.labels.filter(function(item) {
                                        return item.labelPurpose == "relationshipName";
                                    })[0].attrs.text.text;
        
                                    var solutionRelationshipName = solutionClassExitRelationship.labels.filter(function(item) {
                                        return item.labelPurpose == "relationshipName";
                                    })[0].attrs.text.text;
        
                                    if (proposalRelationshipName == solutionRelationshipName || levenshteinDistance(proposalRelationshipName, solutionRelationshipName) <= maxLev) {

                                        console.log("Plus point exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                        totalPoints += relationshipPoint;
                                        itemEvaluationArray.push(new ItemEvaluation("class relationship", relationshipPoint, relationshipPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));

                                        console.log("Plus point for name (" + proposalRelationshipName + ") in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                        totalPoints += relationshipNamePoint;
                                        itemEvaluationArray.push(new ItemEvaluation("class relationship name", relationshipNamePoint, relationshipNamePoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));

                                        var solutionRelationshipSourceMultiplicity = solutionClassExitRelationship.labels.filter(function(item) {
                                            return item.labelPurpose == "sourceMultiplicity";
                                        })[0].multiplicity;
            
                                        var proposalRelationshipSourceMultiplicity = proposalClassRelationshipsToTarget.labels.filter(function(item) {
                                            return item.labelPurpose == "sourceMultiplicity";
                                        })[0].multiplicity;
                        
                                        var solutionRelationshipTargetMultiplicity = solutionClassExitRelationship.labels.filter(function(item) {
                                            return item.labelPurpose == "targetMultiplicity";
                                        })[0].multiplicity;
            
                                        var proposalRelationshipTargetMultiplicity = proposalClassRelationshipsToTarget.labels.filter(function(item) {
                                            return item.labelPurpose == "targetMultiplicity";
                                        })[0].multiplicity;
            
                                        if (proposalTargetClass.id == proposalClassRelationshipsToTarget.target.id) {

                                            if (solutionTargetClass.id = solutionClassExitRelationship.target.id) {

                                                if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                    console.log("Plus point for source multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                
                                                if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                    console.log("Plus point for target multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }

                                            }
                                            else {

                                                if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                    console.log("Plus point for source multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                
                                                if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                    console.log("Plus point for target multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }

                                            }

                                        }
                                        else {
                                            if (solutionTargetClass.id = solutionClassExitRelationship.target.id) {
                                                if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                    console.log("Plus point for source multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                
                                                if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                    console.log("Plus point for target multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                            }
                                            else {

                                                if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                    console.log("Plus point for source multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                
                                                if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                    console.log("Plus point for target multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                                }

                                            }
                                        }
            
                                        solutionClassExitRelationship.isFound = true;

                                    }

                                }
                                else {

                                    proposalClassRelationshipsToTarget = proposalClassRelationshipsToTarget[0];
    
                                    var proposalRelationshipName = proposalClassRelationshipsToTarget.labels.filter(function(item) {
                                        return item.labelPurpose == "relationshipName";
                                    })[0].attrs.text.text;
        
                                    var solutionRelationshipName = solutionClassExitRelationship.labels.filter(function(item) {
                                        return item.labelPurpose == "relationshipName";
                                    })[0].attrs.text.text;

                                    console.log("Plus point exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                    totalPoints += relationshipPoint;
                                    itemEvaluationArray.push(new ItemEvaluation("class relationship", relationshipPoint, relationshipPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
        
                                    if (proposalRelationshipName == solutionRelationshipName || levenshteinDistance(proposalRelationshipName, solutionRelationshipName) <= maxLev) {
                                        console.log("Plus point for name (" + proposalRelationshipName + ") in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                        totalPoints += relationshipNamePoint;
                                        itemEvaluationArray.push(new ItemEvaluation("class relationship name", relationshipNamePoint, relationshipNamePoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                    }
                                    else {
                                        itemEvaluationArray.push(new ItemEvaluation("class relationship name", 0, relationshipNamePoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                    }
        
                                    var solutionRelationshipSourceMultiplicity = solutionClassExitRelationship.labels.filter(function(item) {
                                        return item.labelPurpose == "sourceMultiplicity";
                                    })[0].multiplicity;
        
                                    var proposalRelationshipSourceMultiplicity = proposalClassRelationshipsToTarget.labels.filter(function(item) {
                                        return item.labelPurpose == "sourceMultiplicity";
                                    })[0].multiplicity;
        
                                    var solutionRelationshipTargetMultiplicity = solutionClassExitRelationship.labels.filter(function(item) {
                                        return item.labelPurpose == "targetMultiplicity";
                                    })[0].multiplicity;
        
                                    var proposalRelationshipTargetMultiplicity = proposalClassRelationshipsToTarget.labels.filter(function(item) {
                                        return item.labelPurpose == "targetMultiplicity";
                                    })[0].multiplicity;
        
                                    if (proposalTargetClass.id == proposalClassRelationshipsToTarget.target.id) {

                                        if (solutionTargetClass.id = solutionClassExitRelationship.target.id) {

                                            if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                console.log("Plus point for source multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                totalPoints += relationshipMultiplicityPoint;
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                            }
                                            else {
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                            }
            
                                            if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                console.log("Plus point for target multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                totalPoints += relationshipMultiplicityPoint;
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                            }
                                            else {
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                            }

                                        }
                                        else {

                                            if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                console.log("Plus point for source multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                totalPoints += relationshipMultiplicityPoint;
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                            }
                                            else {
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                            }
            
                                            if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                console.log("Plus point for target multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                totalPoints += relationshipMultiplicityPoint;
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                            }
                                            else {
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                            }

                                        }

                                    }
                                    else {
                                        if (solutionTargetClass.id = solutionClassExitRelationship.target.id) {
                                            if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                console.log("Plus point for source multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                totalPoints += relationshipMultiplicityPoint;
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                            }
                                            else {
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                            }
            
                                            if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                console.log("Plus point for target multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                totalPoints += relationshipMultiplicityPoint;
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                            }
                                            else {
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                            }
                                        }
                                        else {

                                            if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                console.log("Plus point for source multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                totalPoints += relationshipMultiplicityPoint;
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                            }
                                            else {
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                            }
            
                                            if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                console.log("Plus point for target multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                totalPoints += relationshipMultiplicityPoint;
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                            }
                                            else {
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                            }

                                        }
                                    }
        
                                    solutionClassExitRelationship.isFound = true;

                                }

                            }
    
                        }
                        else {
                            console.log("Found target class with similar name: " + proposalTargetClass.name);
    
                            var proposalClassRelationshipToTarget = proposedSolutionGraph.filter(function(item) {
                                return item.type == solutionClassExitRelationship.type
                                && item.source.id == proposalSourceClass.id 
                                && item.target.id == proposalTargetClass.id;
                            })[0] || null;
    
                            if (proposalClassRelationshipToTarget != null) {
    
                                console.log("Plus point exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                totalPoints += relationshipPoint;
                                itemEvaluationArray.push(new ItemEvaluation("class relationship", relationshipPoint, relationshipPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
    
                                var proposalRelationshipName = proposalClassRelationshipToTarget.labels.filter(function(item) {
                                    return item.labelPurpose == "relationshipName";
                                })[0].attrs.text.text;
    
                                var solutionRelationshipName = solutionClassExitRelationship.labels.filter(function(item) {
                                    return item.labelPurpose == "relationshipName";
                                })[0].attrs.text.text;
    
                                if (proposalRelationshipName == solutionRelationshipName || levenshteinDistance(proposalRelationshipName, solutionRelationshipName) <= maxLev) {
                                    console.log("Plus point for name in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                    totalPoints += relationshipNamePoint;
                                    itemEvaluationArray.push(new ItemEvaluation("class relationship name", relationshipNamePoint, relationshipNamePoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                }
                                else {
                                    itemEvaluationArray.push(new ItemEvaluation("class relationship name", 0, relationshipNamePoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                }
    
                                if (solutionClassExitRelationship.type != "uml.Generalization" && solutionClassExitRelationship.type != "uml.Implementation") {
    
                                    var solutionRelationshipSourceMultiplicity = solutionClassExitRelationship.labels.filter(function(item) {
                                        return item.labelPurpose == "sourceMultiplicity";
                                    })[0].multiplicity;
    
                                    var proposalRelationshipSourceMultiplicity = proposalClassRelationshipToTarget.labels.filter(function(item) {
                                        return item.labelPurpose == "sourceMultiplicity";
                                    })[0].multiplicity;
    
                                    if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                        console.log("Plus point for source multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                        totalPoints += relationshipMultiplicityPoint;
                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                    }
                                    else {
                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                    }
    
                                    var solutionRelationshipTargetMultiplicity = solutionClassExitRelationship.labels.filter(function(item) {
                                        return item.labelPurpose == "targetMultiplicity";
                                    })[0].multiplicity;
    
                                    var proposalRelationshipTargetMultiplicity = proposalClassRelationshipToTarget.labels.filter(function(item) {
                                        return item.labelPurpose == "targetMultiplicity";
                                    })[0].multiplicity;
    
                                    if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                        console.log("Plus point for target multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                        totalPoints += relationshipMultiplicityPoint;
                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                    }
                                    else {
                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + proposalTargetClass.name + "(" + `${proposalRelationshipName}` + ")"));
                                    }
    
                                }
    
                                solutionClassExitRelationship.isFound = true;
                            }
    
                        }
                    }

                }
            });

        });

        var solutionRelationships = solutionGraph.filter(function(item) {
            return relationshipTypes.includes(item.type);
        });

        var checkedOrRemovedSolutionRelationships = solutionRelationships.filter(function(item) {
            return item.isRemoved == true || item.isFound == true;
        });

        if (solutionRelationships.length == 0) {
            itemEvaluationArray.push(new ItemEvaluation("solution relationships full point", 0, "N/A"));
            return true;
        }
        if (solutionRelationships.length > 0 && solutionRelationships.length == checkedOrRemovedSolutionRelationships.length) {
            console.log("Plus full point for all relationships");
            totalPoints += relationshipFullPoint;
            itemEvaluationArray.push(new ItemEvaluation("solution relationships full point", relationshipFullPoint, relationshipFullPoint));

            return true;
        }
        
        itemEvaluationArray.push(new ItemEvaluation("solution relationships full point", 0, relationshipFullPoint));

        return false;

    }

    function CheckRelationshipsNonStrict(solutionGraph, proposedSolutionGraph) {

        console.log("Checking non strict relationships");

        var solutionClasses = solutionGraph.filter(function(item) {
            return classTypes.includes(item.type) && item.isRemoved != true;
        });

        solutionClasses.forEach(solutionClass => {
			
			var proposalSourceClass = proposedSolutionGraph.filter(function(item) {
				return classTypes.includes(item.type) && (item.name == solutionClass.name || levenshteinDistance(item.name, solutionClass.name) <= maxLev);
			})[0] || null;
			
			if (proposalSourceClass != null) {
				
				var solutionClassExitRelationships = solutionGraph.filter(function(item) {
					return relationshipTypes.includes(item.type) 
					&& (item.isRemoved != true && item.isFound != true)
					&& item.source.id == solutionClass.id;
				});
				
                console.log("Remaining relationships to find for class " + solutionClass.name + ": " + solutionClassExitRelationships.length);

				for (let solutionClassExitRelationship of solutionClassExitRelationships) {
					
					var solutionTargetClass = solutionClasses.filter(function(item) {
                        return item.id == solutionClassExitRelationship.target.id;
                    })[0];
					
					var proposalTargetClass = proposedSolutionGraph.filter(function(item) {
                        return classTypes.includes(item.type) && (item.name == solutionTargetClass.name || levenshteinDistance(item.name, solutionTargetClass.name) <= maxLev);
                    })[0] || null;
					
					if (proposalTargetClass != null) {

                        console.log("Found proposal target class: " + proposalTargetClass.name);
						
                        //proposal target class generalization
						var proposalTargetClassGeneralization = proposedSolutionGraph.filter(function(item) {
                            return item.type == "uml.Generalization" && item.source.id == proposalTargetClass.id;
                        }).map(function (item) {
                                return item.target.id;
                        })[0] || null;

                        //proposal source class generalization
						var proposalSourceClassGeneralization = proposedSolutionGraph.filter(function(item) {
                            return item.type == "uml.Generalization" && item.source.id == proposalSourceClass.id;
                        }).map(function (item) {
                                return item.target.id;
                        })[0] || null;
						
						if (proposalTargetClassGeneralization != null) {

                            console.log("Generalized class found: " + proposalTargetClassGeneralization);

                            var generalizedClassName = proposedSolutionGraph.filter(function(item) {
                                return classTypes.includes(item.type) && item.id == proposalTargetClassGeneralization;
                            })[0].name;
							
							if (solutionClassExitRelationship.type == "uml.Association") {
								
								var proposalClassAssociationRelationships = proposedSolutionGraph.filter(function(item) {
									return item.type == solutionClassExitRelationship.type
									&& (
										(item.source.id == proposalSourceClass.id && item.target.id == proposalTargetClassGeneralization) 
										|| (item.target.id == proposalSourceClass.id && item.source.id == proposalTargetClassGeneralization)
									);
								});
							
								if (proposalClassAssociationRelationships == null || proposalClassAssociationRelationships.length == 0) {
									console.log("No associations found");
								}
								else if (proposalClassAssociationRelationships.length == 1) {
									
									proposalClassAssociationRelationships = proposalClassAssociationRelationships[0];
									
                                    var solutionAssociationsBetweenSameClasses = solutionGraph.filter(function(item) {
                                        return item.type == "uml.Association"
                                        && (
                                            (item.source.id == solutionTargetClass.id && item.target.id == solutionClass.id) 
                                            || (item.target.id == solutionTargetClass.id && item.source.id == solutionClass.id));
                                    });

                                    if (solutionAssociationsBetweenSameClasses != null && solutionAssociationsBetweenSameClasses.length > 1) {

                                        var proposalRelationshipName = proposalClassAssociationRelationships.labels.filter(function(item) {
                                            return item.labelPurpose == "relationshipName";
                                        })[0].attrs.text.text;
        
                                        var solutionRelationshipName = solutionClassExitRelationship.labels.filter(function(item) {
                                            return item.labelPurpose == "relationshipName";
                                        })[0].attrs.text.text;
        
                                        if (proposalRelationshipName == solutionRelationshipName || levenshteinDistance(proposalRelationshipName, solutionRelationshipName) <= maxLev) {
                                            
                                            console.log("Plus point indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                            totalPoints += relationshipPartialPoint;
                                            itemEvaluationArray.push(new ItemEvaluation("class relationship", relationshipPartialPoint, relationshipPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                            
                                            console.log("Plus point for name in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                            totalPoints += relationshipNamePoint;
                                            itemEvaluationArray.push(new ItemEvaluation("class relationship name", relationshipNamePoint, relationshipNamePoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));

                                            solutionClassExitRelationship.isFound = true;

                                            var solutionRelationshipSourceMultiplicity = solutionClassExitRelationship.labels.filter(function(item) {
                                                return item.labelPurpose == "sourceMultiplicity";
                                            })[0].multiplicity;
    
                                            var proposalRelationshipSourceMultiplicity = proposalClassAssociationRelationships.labels.filter(function(item) {
                                                return item.labelPurpose == "sourceMultiplicity";
                                            })[0].multiplicity;
        
                                            var solutionRelationshipTargetMultiplicity = solutionClassExitRelationship.labels.filter(function(item) {
                                                return item.labelPurpose == "targetMultiplicity";
                                            })[0].multiplicity;
    
                                            var proposalRelationshipTargetMultiplicity = proposalClassAssociationRelationships.labels.filter(function(item) {
                                                return item.labelPurpose == "targetMultiplicity";
                                            })[0].multiplicity;
    
                                            if (proposalTargetClassGeneralization == proposalClassAssociationRelationships.target.id) {

                                                if (solutionTargetClass.id == solutionClassExitRelationship.target.id) {
    
                                                    if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                        console.log("Plus point for source multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                        totalPoints += relationshipMultiplicityPoint;
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
                                                    else {
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
                    
                                                    if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                        console.log("Plus point for target multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                        totalPoints += relationshipMultiplicityPoint;
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
                                                    else {
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
    
                                                }
                                                else {
    
                                                    if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                        console.log("Plus point for source multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                        totalPoints += relationshipMultiplicityPoint;
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
                                                    else {
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
                    
                                                    if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                        console.log("Plus point for target multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                        totalPoints += relationshipMultiplicityPoint;
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
                                                    else {
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
    
                                                }
    
                                            }
                                            else {
                                                if (solutionTargetClass.id == solutionClassExitRelationship.target.id) {
                                                    if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                        console.log("Plus point for source multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                        totalPoints += relationshipMultiplicityPoint;
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
                                                    else {
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
                    
                                                    if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                        console.log("Plus point for target multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                        totalPoints += relationshipMultiplicityPoint;
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
                                                    else {
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
                                                }
                                                else {
    
                                                    if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                        console.log("Plus point for source multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                        totalPoints += relationshipMultiplicityPoint;
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
                                                    else {
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
                    
                                                    if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                        console.log("Plus point for target multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                        totalPoints += relationshipMultiplicityPoint;
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
                                                    else {
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
    
                                                }
                                            }
                                        }

                                    }
                                    else {

                                        var proposalRelationshipName = proposalClassAssociationRelationships.labels.filter(function(item) {
                                            return item.labelPurpose == "relationshipName";
                                        })[0].attrs.text.text;
        
                                        var solutionRelationshipName = solutionClassExitRelationship.labels.filter(function(item) {
                                            return item.labelPurpose == "relationshipName";
                                        })[0].attrs.text.text;

                                        console.log("Plus point indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                        totalPoints += relationshipPartialPoint;
                                        itemEvaluationArray.push(new ItemEvaluation("class relationship", relationshipPartialPoint, relationshipPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                        
                                        solutionClassExitRelationship.isFound = true;
        
                                        if (proposalRelationshipName == solutionRelationshipName || levenshteinDistance(proposalRelationshipName, solutionRelationshipName) <= maxLev) {
                                            console.log("Plus point for name in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                            totalPoints += relationshipNamePoint;
                                            itemEvaluationArray.push(new ItemEvaluation("class relationship name", relationshipNamePoint, relationshipNamePoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                        }
                                        else {
                                            itemEvaluationArray.push(new ItemEvaluation("class relationship name", 0, relationshipNamePoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                        }
        
                                        var solutionRelationshipSourceMultiplicity = solutionClassExitRelationship.labels.filter(function(item) {
                                            return item.labelPurpose == "sourceMultiplicity";
                                        })[0].multiplicity;

                                        var proposalRelationshipSourceMultiplicity = proposalClassAssociationRelationships.labels.filter(function(item) {
                                            return item.labelPurpose == "sourceMultiplicity";
                                        })[0].multiplicity;

                                        var solutionRelationshipTargetMultiplicity = solutionClassExitRelationship.labels.filter(function(item) {
                                            return item.labelPurpose == "targetMultiplicity";
                                        })[0].multiplicity;

                                        var proposalRelationshipTargetMultiplicity = proposalClassAssociationRelationships.labels.filter(function(item) {
                                            return item.labelPurpose == "targetMultiplicity";
                                        })[0].multiplicity;

                                        if (proposalTargetClassGeneralization == proposalClassAssociationRelationships.target.id) {

                                            if (solutionTargetClass.id == solutionClassExitRelationship.target.id) {

                                                if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                    console.log("Plus point for source multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                
                                                if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                    console.log("Plus point for target multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }

                                            }
                                            else {

                                                if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                    console.log("Plus point for source multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                
                                                if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                    console.log("Plus point for target multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }

                                            }

                                        }
                                        else {
                                            if (solutionTargetClass.id == solutionClassExitRelationship.target.id) {
                                                if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                    console.log("Plus point for source multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                
                                                if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                    console.log("Plus point for target multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                            }
                                            else {

                                                if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                    console.log("Plus point for source multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                
                                                if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                    console.log("Plus point for target multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }

                                            }
                                        }
                                    }               
									
								}
								else {
									var solutionRelationshipName = solutionClassExitRelationship.labels.filter(function(item) {
										return item.labelPurpose == "relationshipName";
									})[0].attrs.text.text;
									
									for (let proposalClassRelationshipToTarget of proposalClassRelationshipsToTarget) {
    
                                        var proposalRelationshipName = proposalClassRelationshipToTarget.labels.filter(function(item) {
                                            return item.labelPurpose == "relationshipName";
                                        })[0].attrs.text.text;
        
                                        if (solutionRelationshipName == proposalRelationshipName || levenshteinDistance(solutionRelationshipName, proposalRelationshipName) <= maxLev) {
                                            console.log("Plus point indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClassName + ")");
                                            totalPoints += relationshipPartialPoint;
                                            itemEvaluationArray.push(new ItemEvaluation("class relationship", relationshipPartialPoint, relationshipPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                            
                                            console.log("Plus point for name in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClassName + ")");
                                            totalPoints += relationshipNamePoint;
                                            itemEvaluationArray.push(new ItemEvaluation("class relationship name", relationshipNamePoint, relationshipNamePoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
        
                                            var solutionRelationshipSourceMultiplicity = solutionClassExitRelationship.labels.filter(function(item) {
                                                return item.labelPurpose == "sourceMultiplicity";
                                            })[0].multiplicity;
            
                                            var proposalRelationshipSourceMultiplicity = proposalClassRelationshipToTarget.labels.filter(function(item) {
                                                return item.labelPurpose == "sourceMultiplicity";
                                            })[0].multiplicity;
                        
                                            var solutionRelationshipTargetMultiplicity = solutionClassExitRelationship.labels.filter(function(item) {
                                                return item.labelPurpose == "targetMultiplicity";
                                            })[0].multiplicity;
            
                                            var proposalRelationshipTargetMultiplicity = proposalClassRelationshipToTarget.labels.filter(function(item) {
                                                return item.labelPurpose == "targetMultiplicity";
                                            })[0].multiplicity;
            
                                            if (proposalTargetClass.id == proposalClassRelationshipToTarget.target.id) {

                                                if (solutionTargetClass.id == solutionClassExitRelationship.target.id) {
    
                                                    if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                        console.log("Plus point for source multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                        totalPoints += relationshipMultiplicityPoint;
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
                                                    else {
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
                    
                                                    if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                        console.log("Plus point for target multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                        totalPoints += relationshipMultiplicityPoint;
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
                                                    else {
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
    
                                                }
                                                else {
    
                                                    if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                        console.log("Plus point for source multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                        totalPoints += relationshipMultiplicityPoint;
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
                                                    else {
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
                    
                                                    if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                        console.log("Plus point for target multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                        totalPoints += relationshipMultiplicityPoint;
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
                                                    else {
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
    
                                                }
    
                                            }
                                            else {
                                                if (solutionTargetClass.id == solutionClassExitRelationship.target.id) {
                                                    if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                        console.log("Plus point for source multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                        totalPoints += relationshipMultiplicityPoint;
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
                                                    else {
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
                    
                                                    if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                        console.log("Plus point for target multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                        totalPoints += relationshipMultiplicityPoint;
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
                                                    else {
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
                                                }
                                                else {
    
                                                    if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                        console.log("Plus point for source multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                        totalPoints += relationshipMultiplicityPoint;
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
                                                    else {
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
                    
                                                    if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                        console.log("Plus point for target multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                        totalPoints += relationshipMultiplicityPoint;
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
                                                    else {
                                                        itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                    }
    
                                                }
                                            }
                
                                            solutionClassExitRelationship.isFound = true;
                                            break;
                                        }
    
                                    }
								}
								
							}
							else {
								var proposalClassRelationship = proposedSolutionGraph.filter(function(item) {
									return item.type == solutionClassExitRelationship.type
									&& item.source.id == proposalSourceClass.id 
									&& proposalTargetClassGeneralization == item.target.id;
								})[0] || null;
								
								if (proposalClassRelationship != null){

                                    var proposalRelationshipName = proposalClassRelationship.labels.filter(function(item) {
                                        return item.labelPurpose == "relationshipName";
                                    })[0].attrs.text.text;
    
                                    var solutionRelationshipName = solutionClassExitRelationship.labels.filter(function(item) {
                                        return item.labelPurpose == "relationshipName";
                                    })[0].attrs.text.text;

									console.log("Plus point indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                    totalPoints += relationshipPartialPoint;
                                    itemEvaluationArray.push(new ItemEvaluation("class relationship", relationshipPartialPoint, relationshipPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
        
                                    if (proposalRelationshipName == solutionRelationshipName || levenshteinDistance(proposalRelationshipName, solutionRelationshipName) <= maxLev) {
                                        console.log("Plus point for name in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                        totalPoints += relationshipNamePoint;
                                        itemEvaluationArray.push(new ItemEvaluation("class relationship name", relationshipNamePoint, relationshipNamePoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                    }
                                    else {
                                        itemEvaluationArray.push(new ItemEvaluation("class relationship name", 0, relationshipNamePoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                    }
    
                                    if (solutionClassExitRelationship.type != "uml.Generalization" && solutionClassExitRelationship.type != "uml.Implementation") {
    
                                        var solutionRelationshipSourceMultiplicity = solutionClassExitRelationship.labels.filter(function(item) {
                                            return item.labelPurpose == "sourceMultiplicity";
                                        })[0].multiplicity;
    
                                        var proposalRelationshipSourceMultiplicity = proposalClassRelationship.labels.filter(function(item) {
                                            return item.labelPurpose == "sourceMultiplicity";
                                        })[0].multiplicity;
    
                                        if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                            console.log("Plus point for source multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                            totalPoints += relationshipMultiplicityPoint;
                                            itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                        }
                                        else {
                                            itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                        }
    
                                        var solutionRelationshipTargetMultiplicity = solutionClassExitRelationship.labels.filter(function(item) {
                                            return item.labelPurpose == "targetMultiplicity";
                                        })[0].multiplicity;
    
                                        var proposalRelationshipTargetMultiplicity = proposalClassRelationship.labels.filter(function(item) {
                                            return item.labelPurpose == "targetMultiplicity";
                                        })[0].multiplicity;
    
                                        if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                            console.log("Plus point for target multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                            totalPoints += relationshipMultiplicityPoint;
                                            itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                        }
                                        else {
                                            itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                        }
    
                                    }

                                    solutionClassExitRelationship.isFound = true;
    
                                    isFound = true;
                                    break;
                                }
                            }
						}
                        //needed for handling association (two way relationship)
                        else if(proposalSourceClassGeneralization != null && solutionClassExitRelationship.type == "uml.Association") {
                            console.log("Generalized class found: " + proposalSourceClassGeneralization);

                            var generalizedClassName = proposedSolutionGraph.filter(function(item) {
                                return classTypes.includes(item.type) && item.id == proposalSourceClassGeneralization;
                            })[0].name;
							
                            var proposalClassAssociationRelationships = proposedSolutionGraph.filter(function(item) {
                                return item.type == solutionClassExitRelationship.type
                                && (
                                    (item.source.id == proposalTargetClass.id && item.target.id == proposalSourceClassGeneralization) 
                                    || (item.target.id == proposalTargetClass.id && item.source.id == proposalSourceClassGeneralization)
                                );
                            });
                        
                            if (proposalClassAssociationRelationships == null || proposalClassAssociationRelationships.length == 0) {
                                console.log("No associations found");
                            }
                            else if (proposalClassAssociationRelationships.length == 1) {
                                
                                proposalClassAssociationRelationships = proposalClassAssociationRelationships[0];
                                
                                var solutionAssociationsBetweenSameClasses = solutionGraph.filter(function(item) {
                                    return item.type == "uml.Association"
                                    && (
                                        (item.source.id == solutionTargetClass.id && item.target.id == solutionClass.id) 
                                        || (item.target.id == solutionTargetClass.id && item.source.id == solutionClass.id));
                                });

                                if (solutionAssociationsBetweenSameClasses != null && solutionAssociationsBetweenSameClasses.length > 1) {

                                    var proposalRelationshipName = proposalClassAssociationRelationships.labels.filter(function(item) {
                                        return item.labelPurpose == "relationshipName";
                                    })[0].attrs.text.text;
    
                                    var solutionRelationshipName = solutionClassExitRelationship.labels.filter(function(item) {
                                        return item.labelPurpose == "relationshipName";
                                    })[0].attrs.text.text;
    
                                    if (proposalRelationshipName == solutionRelationshipName || levenshteinDistance(proposalRelationshipName, solutionRelationshipName) <= maxLev) {
                                        
                                        console.log("Plus point indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                        totalPoints += relationshipPartialPoint;
                                        itemEvaluationArray.push(new ItemEvaluation("class relationship", relationshipPartialPoint, relationshipPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                        
                                        console.log("Plus point for name in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                        totalPoints += relationshipNamePoint;
                                        itemEvaluationArray.push(new ItemEvaluation("class relationship name", relationshipNamePoint, relationshipNamePoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));

                                        solutionClassExitRelationship.isFound = true;

                                        var solutionRelationshipSourceMultiplicity = solutionClassExitRelationship.labels.filter(function(item) {
                                            return item.labelPurpose == "sourceMultiplicity";
                                        })[0].multiplicity;

                                        var proposalRelationshipSourceMultiplicity = proposalClassAssociationRelationships.labels.filter(function(item) {
                                            return item.labelPurpose == "sourceMultiplicity";
                                        })[0].multiplicity;
    
                                        var solutionRelationshipTargetMultiplicity = solutionClassExitRelationship.labels.filter(function(item) {
                                            return item.labelPurpose == "targetMultiplicity";
                                        })[0].multiplicity;

                                        var proposalRelationshipTargetMultiplicity = proposalClassAssociationRelationships.labels.filter(function(item) {
                                            return item.labelPurpose == "targetMultiplicity";
                                        })[0].multiplicity;

                                        if (proposalSourceClassGeneralization == proposalClassAssociationRelationships.target.id) {

                                            if (solutionTargetClass.id == solutionClassExitRelationship.target.id) {

                                                if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                    console.log("Plus point for source multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                
                                                if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                    console.log("Plus point for target multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }

                                            }
                                            else {

                                                if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                    console.log("Plus point for source multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                
                                                if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                    console.log("Plus point for target multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }

                                            }

                                        }
                                        else {
                                            if (solutionTargetClass.id == solutionClassExitRelationship.target.id) {
                                                if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                    console.log("Plus point for source multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                
                                                if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                    console.log("Plus point for target multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                            }
                                            else {

                                                if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                    console.log("Plus point for source multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                
                                                if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                    console.log("Plus point for target multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }

                                            }
                                        }
                                    }

                                }
                                else {

                                    var proposalRelationshipName = proposalClassAssociationRelationships.labels.filter(function(item) {
                                        return item.labelPurpose == "relationshipName";
                                    })[0].attrs.text.text;
    
                                    var solutionRelationshipName = solutionClassExitRelationship.labels.filter(function(item) {
                                        return item.labelPurpose == "relationshipName";
                                    })[0].attrs.text.text;

                                    console.log("Plus point indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                    totalPoints += relationshipPartialPoint;
                                    itemEvaluationArray.push(new ItemEvaluation("class relationship", relationshipPartialPoint, relationshipPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                    
                                    solutionClassExitRelationship.isFound = true;
    
                                    if (proposalRelationshipName == solutionRelationshipName || levenshteinDistance(proposalRelationshipName, solutionRelationshipName) <= maxLev) {
                                        console.log("Plus point for name in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                        totalPoints += relationshipNamePoint;
                                        itemEvaluationArray.push(new ItemEvaluation("class relationship name", relationshipNamePoint, relationshipNamePoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                    }
                                    else {
                                        itemEvaluationArray.push(new ItemEvaluation("class relationship name", 0, relationshipNamePoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                    }
    
                                    var solutionRelationshipSourceMultiplicity = solutionClassExitRelationship.labels.filter(function(item) {
                                        return item.labelPurpose == "sourceMultiplicity";
                                    })[0].multiplicity;

                                    var proposalRelationshipSourceMultiplicity = proposalClassAssociationRelationships.labels.filter(function(item) {
                                        return item.labelPurpose == "sourceMultiplicity";
                                    })[0].multiplicity;

                                    var solutionRelationshipTargetMultiplicity = solutionClassExitRelationship.labels.filter(function(item) {
                                        return item.labelPurpose == "targetMultiplicity";
                                    })[0].multiplicity;

                                    var proposalRelationshipTargetMultiplicity = proposalClassAssociationRelationships.labels.filter(function(item) {
                                        return item.labelPurpose == "targetMultiplicity";
                                    })[0].multiplicity;

                                    if (proposalSourceClassGeneralization == proposalClassAssociationRelationships.target.id) {

                                        if (solutionTargetClass.id != solutionClassExitRelationship.target.id) {

                                            if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                console.log("Plus point for source multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                totalPoints += relationshipMultiplicityPoint;
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                            }
                                            else {
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                            }
            
                                            if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                console.log("Plus point for target multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                totalPoints += relationshipMultiplicityPoint;
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                            }
                                            else {
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                            }

                                        }
                                        else {

                                            if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                console.log("Plus point for source multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                totalPoints += relationshipMultiplicityPoint;
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                            }
                                            else {
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                            }
            
                                            if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                console.log("Plus point for target multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                totalPoints += relationshipMultiplicityPoint;
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                            }
                                            else {
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                            }

                                        }

                                    }
                                    else {
                                        if (solutionTargetClass.id != solutionClassExitRelationship.target.id) {
                                            if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                console.log("Plus point for source multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                totalPoints += relationshipMultiplicityPoint;
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                            }
                                            else {
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                            }
            
                                            if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                console.log("Plus point for target multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                totalPoints += relationshipMultiplicityPoint;
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                            }
                                            else {
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                            }
                                        }
                                        else {

                                            if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                console.log("Plus point for source multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                totalPoints += relationshipMultiplicityPoint;
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                            }
                                            else {
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                            }
            
                                            if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                console.log("Plus point for target multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                totalPoints += relationshipMultiplicityPoint;
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                            }
                                            else {
                                                itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                            }

                                        }
                                    }
                                }               
                                
                            }
                            else {
                                var solutionRelationshipName = solutionClassExitRelationship.labels.filter(function(item) {
                                    return item.labelPurpose == "relationshipName";
                                })[0].attrs.text.text;
                                
                                for (let proposalClassRelationshipToTarget of proposalClassRelationshipsToTarget) {

                                    var proposalRelationshipName = proposalClassRelationshipToTarget.labels.filter(function(item) {
                                        return item.labelPurpose == "relationshipName";
                                    })[0].attrs.text.text;
    
                                    if (solutionRelationshipName == proposalRelationshipName || levenshteinDistance(solutionRelationshipName, proposalRelationshipName) <= maxLev) {
                                        console.log("Plus point indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClassName + ")");
                                        totalPoints += relationshipPartialPoint;
                                        itemEvaluationArray.push(new ItemEvaluation("class relationship", relationshipPartialPoint, relationshipPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                        
                                        console.log("Plus point for name in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClassName + ")");
                                        totalPoints += relationshipNamePoint;
                                        itemEvaluationArray.push(new ItemEvaluation("class relationship name", relationshipNamePoint, relationshipNamePoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
    
                                        var solutionRelationshipSourceMultiplicity = solutionClassExitRelationship.labels.filter(function(item) {
                                            return item.labelPurpose == "sourceMultiplicity";
                                        })[0].multiplicity;
        
                                        var proposalRelationshipSourceMultiplicity = proposalClassRelationshipToTarget.labels.filter(function(item) {
                                            return item.labelPurpose == "sourceMultiplicity";
                                        })[0].multiplicity;
                    
                                        var solutionRelationshipTargetMultiplicity = solutionClassExitRelationship.labels.filter(function(item) {
                                            return item.labelPurpose == "targetMultiplicity";
                                        })[0].multiplicity;
        
                                        var proposalRelationshipTargetMultiplicity = proposalClassRelationshipToTarget.labels.filter(function(item) {
                                            return item.labelPurpose == "targetMultiplicity";
                                        })[0].multiplicity;
        
                                        if (proposalTargetClass.id == proposalClassRelationshipToTarget.target.id) {

                                            if (solutionTargetClass.id == solutionClassExitRelationship.target.id) {

                                                if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                    console.log("Plus point for source multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                
                                                if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                    console.log("Plus point for target multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }

                                            }
                                            else {

                                                if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                    console.log("Plus point for source multiplicity in exact match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                
                                                if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                    console.log("Plus point for target multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }

                                            }

                                        }
                                        else {
                                            if (solutionTargetClass.id == solutionClassExitRelationship.target.id) {
                                                if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                    console.log("Plus point for source multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                
                                                if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                    console.log("Plus point for target multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                            }
                                            else {

                                                if (solutionRelationshipSourceMultiplicity.min == proposalRelationshipSourceMultiplicity.min && solutionRelationshipSourceMultiplicity.max == proposalRelationshipSourceMultiplicity.max) {
                                                    console.log("Plus point for source multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                
                                                if (solutionRelationshipTargetMultiplicity.min == proposalRelationshipTargetMultiplicity.min && solutionRelationshipTargetMultiplicity.max == proposalRelationshipTargetMultiplicity.max) {
                                                    console.log("Plus point for target multiplicity in indirect match for relationship (" + solutionClass.name + ", " + solutionTargetClass.name + ")");
                                                    totalPoints += relationshipMultiplicityPoint;
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", relationshipMultiplicityPoint, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }
                                                else {
                                                    itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, solutionClass.name + "->" + solutionTargetClass.name + "(" + `${solutionRelationshipName}` + ";" + solutionClassExitRelationship.type + ")", proposalSourceClass.name + "->" + generalizedClassName + "(" + `${proposalRelationshipName}` + ")"));
                                                }

                                            }
                                        }
            
                                        solutionClassExitRelationship.isFound = true;
                                        break;
                                    }

                                }
                            }
								
                        }
                    }
						
                }
            }
				
        });
    }

    function AddRemainingEmptyPoints(solutionGraph) {

        var solutionRemainingRelationships = solutionGraph.filter(function(item) {
            return relationshipTypes.includes(item.type) 
            && (item.isRemoved != true && item.isFound != true);
        });

        solutionRemainingRelationships.forEach(solutionRemainingRelationship => {

            console.log("Adding all 0 points for relationship that was not found: " + solutionRemainingRelationship.id);

            var sourceClass = solutionGraph.filter(function(item) {
                return classTypes.includes(item.type) && 
                item.id == solutionRemainingRelationship.source.id;
            })[0];

            var targetClass = solutionGraph.filter(function(item) {
                return classTypes.includes(item.type) && 
                item.id == solutionRemainingRelationship.target.id;
            })[0];

            var relationshipTitle = solutionRemainingRelationship.labels.filter(function(item) {
                return item.labelPurpose == "relationshipName";
            })[0].attrs.text.text;

            itemEvaluationArray.push(new ItemEvaluation("class relationship", 0, relationshipPoint, sourceClass.name + "->" + targetClass.name + "(" + `${relationshipTitle}` + ";" + solutionRemainingRelationship.type + ")"));
            itemEvaluationArray.push(new ItemEvaluation("class relationship name", 0, relationshipNamePoint, sourceClass.name + "->" + targetClass.name + "(" + `${relationshipTitle}` + ";" + solutionRemainingRelationship.type + ")"));

            itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, sourceClass.name + "->" + targetClass.name + "(" + `${relationshipTitle}` + ";" + solutionRemainingRelationship.type + ")"));
            itemEvaluationArray.push(new ItemEvaluation("class relationship multiplicity", 0, relationshipMultiplicityPoint, sourceClass.name + "->" + targetClass.name + "(" + `${relationshipTitle}` + ";" + solutionRemainingRelationship.type + ")"));
        });

    }

    CheckClasses(postedSolutionGraph, postedProposedSolution);

    if (CheckRelationshipsStrict(postedSolutionGraph, postedProposedSolution) == false) {
        CheckRelationshipsNonStrict(postedSolutionGraph, postedProposedSolution);
        AddRemainingEmptyPoints(postedSolutionGraph);
    }

    var replyMessage = new ReplyMessage(logEntryArray, totalPoints, itemEvaluationArray, maxPoints);

    console.log();
    console.log("Total points: " + totalPoints.toString());
    console.log("///////////////////////////////////////");
    res.json(replyMessage);
})

var server = app.listen(5000, function () {
   var host = server.address().address
   var port = server.address().port
   console.log("App listening at http://%s:%s", host, port)
})