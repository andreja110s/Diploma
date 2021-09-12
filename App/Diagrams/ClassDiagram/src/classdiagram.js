var graph = new joint.dia.Graph();

var paper = new joint.dia.Paper({
    el: $('#paper'),
    width: "100%",
    height: "100%",
    gridSize: 1,
    model: graph,
    defaultConnector: { name: 'jumpover' },
    interactive: {arrowheadMove : false },
    restrictTranslate: true
});

var drawingLink = false;
var currentlyEditingClass = null;
var currentlyEditingRelationship = null;
var linkSource = null;
var linkTarget = null;
var linkType = null;

var newClassX = null;
var newClassY = null;

var customHighlighter = {
    highlighter: {
      name: 'stroke',
      options: {
        padding: 10,
        rx: 2,
        ry: 2
      }
    }
  }

paper.on({
    'element:pointerdown': function(elementView) {
        if(drawingLink == true) {
            var model = elementView.model;

            linkTarget = model.id;

            linkSource.unhighlight(null, customHighlighter);

            linkSource = linkSource.model.id;

            addRelationship(linkType, linkSource, linkTarget);

            drawingLink = false;
            linkSource = null;
            linkTarget = null;
            linkType = null;

            $("#popUp").empty();
        }
    },
    'element:mouseenter': function(elementView) {
        
        var model = elementView.model;
        var bbox = model.getBBox();
        var ellipseRadius = (1 - Math.cos(g.toRad(45)));
        var offset = model.attr(['pointers', 'pointerShape']) === 'ellipse'
            ? { x: -ellipseRadius * bbox.width / 2, y: ellipseRadius * bbox.height / 2  }
            : { x: -3, y: 3 };

            elementView.addTools(new joint.dia.ToolsView({
            tools: [
                new joint.elementTools.Remove({
                    useModelGeometry: true,
                    y: '0%',
                    x: '100%',
                    offset: offset,
                    action: function(evt) {

                        var cellModel = graph.getCell(this.model.id);

                        var classUsage = checkIfClassIsUsed(cellModel.prop("name"));

                        if (classUsage.length > 0) {
                            showClassRemovalWarning(classUsage);
                        }
                        else {
                            cellModel.remove();
                        }
                    }
                }),
                new joint.elementTools.Button({
                    y: '100%',
                    x: '100%',
                    markup: [{
                        tagName: 'circle',
                        selector: 'button',
                        attributes: {
                            'r': 7,
                            'fill': '#919191',
                            'cursor': 'pointer'
                        }
                    }, {
                        tagName: 'path',
                        selector: 'icon',
                        attributes: {
                            'd': 'M 0 3 0 0 M -2 -1 1 -1 M -1 -4 1 -4',
                            'fill': 'none',
                            'stroke': '#FFFFFF',
                            'stroke-width': 2,
                            'pointer-events': 'none'
                        }
                    }],
                    action: function(evt) {
                        $("#popUp").empty();

                        var cellModel = graph.getCell(this.model.id);

                        currentlyEditingClass = this.model.id;

                        var classEditDiv = composeClassEditWindow(cellModel);

                        $("#popUp").append(classEditDiv);
                    }
                })
            ]
        }));
    },
    'element:mouseleave': function(elementView) {
        elementView.removeTools();
    },
    'element:pointerdblclick': function(elementView) {

        if(drawingLink == false) {
            linkSource = elementView;
            drawingLink = true;
            linkType = "association";

            elementView.highlight(null, customHighlighter);
            $("#popUp").append("<div class=\"popUpRelationshipDrawing\"><button id=\"cancelNewRelationship\">Cancel</button>Select target</div>");
        }
        
    },
    'link:mouseenter': function(linkView) {
        var model = linkView.model;
        var bbox = model.getBBox();
        var ellipseRadius = (1 - Math.cos(g.toRad(45)));
        var offset = model.attr(['pointers', 'pointerShape']) === 'ellipse'
        ? { x: -ellipseRadius * bbox.width / 2, y: ellipseRadius * bbox.height / 2  }
        : { x: -3, y: 3 };

        linkView.addTools(new joint.dia.ToolsView({
            tools: [
                new joint.elementTools.Button({
                    distance: 65,
                    markup: [{
                        tagName: 'circle',
                        selector: 'button',
                        attributes: {
                            'r': 10,
                            'fill': '#919191',
                            'cursor': 'pointer'
                        }
                    }, {
                        tagName: 'path',
                        selector: 'icon',
                        attributes: {
                            'd': 'M 0 3 0 0 M -2 -1 1 -1 M -1 -4 1 -4',
                            'fill': 'none',
                            'stroke': '#FFFFFF',
                            'stroke-width': 2,
                            'pointer-events': 'none'
                        }
                    }],
                    action: function(evt) {

                        var linkModel = graph.getCell(this.model.id);

                        currentlyEditingRelationship = this.model.id;

                        var relationshipEditDiv = composeRelationshipEditWindow(linkModel);

                        $("#popUp").append(relationshipEditDiv);
                    }
                })
            ]
        }));
    },
    'link:mouseleave': function(linkView) {
        linkView.removeTools();
    },
    'blank:pointerdblclick' : function(evt, x, y) {
        newClassX = x;
        newClassY = y;
        showNewClassEditor();
    },
    'blank:contextmenu' : function() {
        showLoadEditor();
    }
});

graph.on('change:vertices', function(linkModel) {

    if (linkModel.prop("source/id") === linkModel.prop("target/id") && linkModel.vertices().length == 0) {
        var sourceClass = graph.getCell(linkModel.prop("source/id"));
        var classPosition = sourceClass.position();
        var classHeight = sourceClass.prop("size/height");

        var vertexY = classPosition.y - 70;

        if (vertexY < 0) {
            vertexY = classPosition.y + classHeight + 70;
        }

        linkModel.vertices([{ x: classPosition.x + 50, y: vertexY }, { x: classPosition.x + 150, y: vertexY }]);
    }
});

var uml = joint.shapes.uml;

function addClass(classType, className, classAttributes, classAttributesDefinition, classMethods, classMethodsDefinition)
{
    var newClass;

    var attributesClassSize = (classAttributes.length * 75)/3;
    var methodsClassSize = (classMethods.length * 75) / 3;

    var size;

    if (attributesClassSize + methodsClassSize < 100) {
        size = { width: 260, height: 100 };
    }
    else {
        size = { width: 260, height: attributesClassSize + methodsClassSize };
    }

    switch (classType)
    {
        case "interface":
            newClass = new uml.Interface ({
                position: { x: newClassX  , y: newClassY },
                size: size,
                name: className,
                attributes: classAttributes,
                attributesDefinition: classAttributesDefinition,
                methods: classMethods,
                methodsDefinition: classMethodsDefinition,
                attrs: {
                    '.uml-class-name-rect': {
                        fill: '#ff8450',
                        stroke: '#fff',
                        'stroke-width': 0.5,
                    },
                    '.uml-class-attrs-rect': {
                        fill: '#fe976a',
                        stroke: '#fff',
                        'stroke-width': 0.5
                    },
                    '.uml-class-methods-rect': {
                        fill: '#fe976a',
                        stroke: '#fff',
                        'stroke-width': 0.5
                    },
                    '.uml-class-attrs-text': {
                        ref: '.uml-class-attrs-rect',
                        'ref-y': 0.5,
                        'y-alignment': 'middle'
                    },
                    '.uml-class-methods-text': {
                        ref: '.uml-class-methods-rect',
                        'ref-y': 0.5,
                        'y-alignment': 'middle'
                    }
                }
            });
            break;
        case "class":
            newClass = new uml.Class ({
                position: { x:newClassX  , y: newClassY },
                size: size,
                name: className,
                attributes: classAttributes,
                attributesDefinition: classAttributesDefinition,
                methods: classMethods,
                methodsDefinition: classMethodsDefinition,
                attrs: {
                    '.uml-class-name-rect': {
                        fill: '#ff8450',
                        stroke: '#fff',
                        'stroke-width': 0.5,
                    },
                    '.uml-class-attrs-rect': {
                        fill: '#fe976a',
                        stroke: '#fff',
                        'stroke-width': 0.5
                    },
                    '.uml-class-methods-rect': {
                        fill: '#fe976a',
                        stroke: '#fff',
                        'stroke-width': 0.5
                    },
                    '.uml-class-attrs-text': {
                        ref: '.uml-class-attrs-rect',
                        'ref-y': 0.5,
                        'y-alignment': 'middle'
                    },
                    '.uml-class-methods-text': {
                        ref: '.uml-class-methods-rect',
                        'ref-y': 0.5,
                        'y-alignment': 'middle'
                    }
                }
            });
            break;
        case "abstractClass":
            newClass = new uml.Abstract ({
                position: { x:newClassX  , y: newClassY },
                size: size,
                name: className,
                attributes: classAttributes,
                attributesDefinition: classAttributesDefinition,
                methods: classMethods,
                methodsDefinition: classMethodsDefinition,
                attrs: {
                    '.uml-class-name-rect': {
                        fill: '#ff8450',
                        stroke: '#fff',
                        'stroke-width': 0.5,
                    },
                    '.uml-class-attrs-rect': {
                        fill: '#fe976a',
                        stroke: '#fff',
                        'stroke-width': 0.5
                    },
                    '.uml-class-methods-rect': {
                        fill: '#fe976a',
                        stroke: '#fff',
                        'stroke-width': 0.5
                    },
                    '.uml-class-attrs-text': {
                        ref: '.uml-class-attrs-rect',
                        'ref-y': 0.5,
                        'y-alignment': 'middle'
                    },
                    '.uml-class-methods-text': {
                        ref: '.uml-class-methods-rect',
                        'ref-y': 0.5,
                        'y-alignment': 'middle'
                    }
                }
            });
            break;
        default:
            throw "Unknown Class Type"
    }

    newClass.attr('.uml-class-attrs-text/font-weight', 'bold');
    newClass.attr('.uml-class-methods-text/font-weight', 'bold');

    graph.addCell(newClass);

    var newClassView = paper.findViewByModel(newClass);

    resizeClassByContentCount(newClass, classAttributes, classMethods, newClassView);

    var newClassWidth = newClass.prop("size/width");
    var newClassHeight = newClass.prop("size/height");

    newClass.position(newClassX - (newClassWidth / 2), newClassY - (newClassHeight / 2));

    newClassX = null;
    newClassY = null;

    return newClass;
};

function editClass(classType, className, classAttributesString, classAttributesDefinition, classMethodsString, classMethodsDefinition) {
    
    var currentClassType = "";

    var cellModel = graph.getCell(currentlyEditingClass);

    switch(cellModel.prop("type")) {
        case "uml.Class":
            currentClassType = "class";
            break;
        case "uml.Abstract":
            currentClassType = "abstractClass";
            break;
        case "uml.Interface":
            currentClassType = "interface";
            break;
    }

    if (currentClassType != classType) {

        var oldClassPosition = cellModel.prop("position");

        var oldClassWidth = cellModel.prop("size/width");
        var oldClassHeight = cellModel.prop("size/height");

        newClassX = oldClassPosition.x + (oldClassWidth / 2);
        newClassY = oldClassPosition.y + (oldClassHeight / 2);

        var newClass = addClass(classType, className, classAttributesString, classAttributesDefinition, classMethodsString, classMethodsDefinition);
        
        var oldCellOutboundLinks = graph.getConnectedLinks(cellModel, { outbound: true });

        oldCellOutboundLinks.forEach(oldCellLink => {
            oldCellLink.source({ id: newClass.id });
        });

        var oldCellInboundLinks = graph.getConnectedLinks(cellModel, { inbound: true });

        oldCellInboundLinks.forEach(oldCellLink => {
            oldCellLink.target({ id: newClass.id });
        });

        cellModel.remove();
    }
    else {
        
        var cellView = paper.findViewByModel(currentlyEditingClass);

        cellModel.prop("name", className);
        cellModel.prop("attributes", classAttributesString);
        cellModel.prop("attributesDefinition", classAttributesDefinition);
        cellModel.prop("methods", classMethodsString);
        cellModel.prop("methodsDefinition", classMethodsDefinition);

        resizeClassByContentCount(cellModel, classAttributesString, classMethodsString, cellView);
    }   

};

function resizeClassByContentCount(classModel, stringAtributes, stringMethods, elementView) {

    var attributesClassSize = (stringAtributes.length * 75)/3;
    var methodsClassSize = (stringMethods.length * 75) / 3;

    var newHeight;
    var newLength;

    if (attributesClassSize + methodsClassSize < 100) {
        newHeight = 100;
    }
    else {
        newHeight = attributesClassSize + methodsClassSize;
    }

    classModel.resize(260, newHeight);
    
    var modelLength = elementView.getBBox().width;

    newLength = modelLength <= 260 ? 260 : Math.floor(modelLength) + 5;
    
    classModel.resize(newLength, newHeight);
}

function addRelationship(type, sourceClassId, targetClassId)
{
    var newRelationship;

    switch(type)
    {
        case "generalization":
            newRelationship = new uml.Generalization({ 
                source: { 
                    id: sourceClassId
                }, 
                target: { 
                    id: targetClassId
                }
            });
            break;
        case "implementation":
            newRelationship = new uml.Implementation({ 
                source: { 
                    id: sourceClassId
                }, 
                target: { 
                    id: targetClassId
                }
            });
            break;
        case "aggregation":
            newRelationship = new uml.Aggregation({ 
                source: { 
                    id: sourceClassId
                }, 
                target: { 
                    id: targetClassId
                }
            });
            break;
        case "composition":
            newRelationship = new uml.Composition({ 
                source: { 
                    id: sourceClassId
                }, 
                target: { 
                    id: targetClassId
                }
            });
            break;
        case "association":
            newRelationship = new uml.Association({ 
                source: { 
                    id: sourceClassId
                }, 
                target: { 
                    id: targetClassId
                }
            });
            break;
        default:
            throw "Unknown Relation Type";
    }

    newRelationship.vertices(getInitialVertex(sourceClassId, targetClassId));

    newRelationship.appendLabel({
        attrs: {
            text: {
                text: ""
            }
        },
        position: {
            distance: 0.5,
            offset: 10
        },
        labelPurpose: "relationshipName"
    });

    newRelationship.appendLabel({
        attrs: {
            text: {
                text: "1"
            }
        },
        position: {
            distance: 0.05,
            offset: 10
        },
        labelPurpose: "sourceMultiplicity",
        multiplicity: {
            min: "1",
            max: ""
        }
    });

    newRelationship.appendLabel({
        attrs: {
            text: {
                text: "1"
            }
        },
        position: {
            distance: 0.95,
            offset: 10
        },
        labelPurpose: "targetMultiplicity",
        multiplicity: {
            min: "1",
            max: ""
        }
    });

    graph.addCell(newRelationship);
}

function getInitialVertex(sourceClassId, targetClassId) {
    
    var sourceClassModel = graph.getCell(sourceClassId);

    var sourceClassAllLinks = graph.getConnectedLinks(sourceClassModel);

    var sourceClassLinks = [];

    sourceClassAllLinks.forEach(sourceClassAllLink => {
        if (sourceClassAllLink.prop("target/id") == targetClassId || sourceClassAllLink.prop("source/id") == targetClassId) {
            sourceClassLinks.push(sourceClassAllLink);
        }
    });

    if (sourceClassId === targetClassId) {

        var classPosition = sourceClassModel.position();
        var classHeight = sourceClassModel.prop("size/height");
        var classWidth = sourceClassModel.prop("size/width");

        if (sourceClassLinks.length == 0) {

            var vertexY = classPosition.y - 70;

            if (vertexY < 0) {
                vertexY = classPosition.y + classHeight + 70;
            }

            return [{ x: classPosition.x + 50, y: vertexY }, { x: classPosition.x + 150, y: vertexY }];
        }
        else {

            var firstVertexXBase = classPosition.x + 10;
            var secondVertexXBase = classPosition.x + classWidth - 10;

            var firstVertexYBase = classPosition.y;
            var secondVertexYBase = classPosition.y;

            if (firstVertexYBase - 90 > 0) {
                firstVertexYBase = firstVertexYBase - 90;
                secondVertexYBase = secondVertexYBase - 90;

                WHILELABEL: while(firstVertexYBase > -1) {

                    for (var sourceClassLink of sourceClassLinks) {
                        for (var vertex of sourceClassLink.prop("vertices")) {
                            if ((Math.abs(vertex.x - firstVertexXBase) < 15 && Math.abs(vertex.y - firstVertexYBase) < 15) || (Math.abs(vertex.x - secondVertexXBase) < 15 && Math.abs(vertex.y - secondVertexYBase) < 15)) {
                                firstVertexYBase = firstVertexYBase - 20;
                                secondVertexYBase = secondVertexYBase - 20;
                                continue WHILELABEL;
                            }
                        }
                    }
                    break;
                }

                if (firstVertexYBase < -1) {

                    firstVertexYBase = classPosition.y + classHeight + 90;
                    secondVertexYBase = classPosition.y + classHeight + 90;

                    for (var sourceClassLink of sourceClassLinks) {
                        for (var vertex of sourceClassLink.prop("vertices")) {
                            if ((Math.abs(vertex.x - firstVertexXBase) < 15 && Math.abs(vertex.y - firstVertexYBase) < 15) || (Math.abs(vertex.x - secondVertexXBase) < 15 && Math.abs(vertex.y - secondVertexYBase) < 15)) {
                                firstVertexYBase = firstVertexYBase + 20;
                                secondVertexYBase = secondVertexYBase + 20;
                            }
                        }
                    }
                }
            }
            else {

                firstVertexYBase = firstVertexYBase + classHeight + 90;
                secondVertexYBase = secondVertexYBase + classHeight + 90;

                for (var sourceClassLink of sourceClassLinks) {
                    for (var vertex of sourceClassLink.prop("vertices")) {
                        if ((Math.abs(vertex.x - firstVertexXBase) < 15 && Math.abs(vertex.y - firstVertexYBase) < 15) || (Math.abs(vertex.x - secondVertexXBase) < 15 && Math.abs(vertex.y - secondVertexYBase) < 15)) {
                            firstVertexYBase = firstVertexYBase + 20;
                            secondVertexYBase = secondVertexYBase + 20;
                        }
                    }
                }
            }

            return [{ x: firstVertexXBase, y: firstVertexYBase }, { x: secondVertexXBase, y: secondVertexYBase }];

        }
    }
    else {
        var targetModel = graph.getCell(targetClassId);

        var vertexXBase = Math.max(sourceClassModel.prop("position/x"), targetModel.prop("position/x")) - 20;
        var vertexYBase = (sourceClassModel.prop("position/y") + sourceClassModel.prop("size/height") + targetModel.prop("position/y")) / 2;

        if (sourceClassLinks.length == 0) {
            return [];
        }
        else if (sourceClassLinks.length == 1) {
            if (sourceClassLinks[0].prop("vertices") == null || sourceClassLinks[0].prop("vertices").length == 0) {
                vertexYBase = vertexYBase - 40;
            }
            else {
                return [];
            }
        }
        else {
            var hasANull = false;

            for (var sourceClassLink of sourceClassLinks) {
                if (sourceClassLink.prop("vertices") == null || sourceClassLink.prop("vertices").length == 0) {
                    hasANull = true;
                    break;
                }
            }

            if (!hasANull) {
                return [];
            }
            else {
                vertexYBase = vertexYBase - 20;

                WHILELABEL: while(true) {

                    for (var sourceClassLink of sourceClassLinks) {
                        for (var vertex of sourceClassLink.prop("vertices")) {
                            if (Math.abs(vertex.x - vertexXBase) < 15 && Math.abs(vertex.y - vertexYBase) < 15) {
                                vertexYBase = vertexYBase - 20;
                                continue WHILELABEL;
                            }
                        }
                    }
                    break;
                }
            }
        }

    }

    return [{x: vertexXBase, y: vertexYBase}];

}

function parseAttributesToString() {
    var attributesToString = [];
    var attributeToString;

    $("#classattrs").children("div").each(function() {
        var attributeType = $(this).children("#attributetype").val();

        var attributeName = $(this).children(".classattribute").val().trim();

        attributeToString = attributeName;

        var isAttributeArray = $(this).children(".isattributearray").is(':checked');

        if (attributeType != "undefined") {
            attributeToString = attributeToString + " : ";

            if (isAttributeArray) {
                attributeToString = attributeToString + "[]";
            }
        }

        switch(attributeType) {
            case "undefined":
                break;
            case "string":
                attributeToString = attributeToString + "String";
                break;
            case "integer":
                attributeToString = attributeToString + "Integer";
                break;
            case "float":
                attributeToString = attributeToString + "Float";
                break;
            case "boolean":
                attributeToString = attributeToString + "Boolean";
                break;
            case "datetime":
                attributeToString = attributeToString + "DateTime";
                break;
            default:
                attributeToString = attributeToString + attributeType;
        }

        attributesToString.push(attributeToString);
    });

    return attributesToString;
}

function parseAttributesToDefinition() {
    var attributesToDefinition = [];
    var attributeToDefinition;

    $("#classattrs").children("div").each(function() {
        var attributeType = $(this).children("#attributetype").val();

        var attributeName = $(this).children(".classattribute").val().trim();

        var isArray = $(this).children(".isattributearray").is(':checked');

        attributeToDefinition = { 'attributeName': attributeName, 'attributeType': attributeType, 'isArray' : isArray};

        attributesToDefinition.push(attributeToDefinition);
    });

    return attributesToDefinition;
}

function parseMethodsToString() {
    var methodsToString = [];
    var methodToString;

    $("#classmethods").children("div").each(function() {
        var methodReturn = $(this).children("#methodreturn").val();

        var methodName = $(this).children(".classmethod").val().trim();

        methodToString = methodName + "(";

        $(this).children("#methodparams").children("div").each(function() {
            var attributeType = $(this).children("#attributetype").val();

            var attributeName = $(this).children(".classattribute").val().trim();

            var isParameterArray = $(this).children(".isparameterarray").is(':checked');

            if (methodToString[methodToString.length - 1] === "(") {
                methodToString = methodToString + attributeName;
            }
            else {
                methodToString = methodToString + ", " + attributeName;
            }

            if (attributeType != "undefined") {
                methodToString = methodToString + " : ";

                if (isParameterArray) {
                    methodToString = methodToString + "[]";
                }
            }

            switch(attributeType) {
                case "undefined":
                    break;
                case "string":
                    methodToString = methodToString + "String";
                    break;
                case "integer":
                    methodToString = methodToString + "Integer";
                    break;
                case "float":
                    methodToString = methodToString + "Float";
                    break;
                case "boolean":
                    methodToString = methodToString + "Boolean";
                    break;
                case "datetime":
                    methodToString = methodToString + "DateTime";
                    break;
                default:
                    methodToString = methodToString + attributeType;
            }
            
        });

        methodToString = methodToString + ")";

        var isMethodArray = $(this).children(".ismethodarray").is(':checked');

        if (methodReturn != "undefined") {
            methodToString = methodToString + " : ";

            if (isMethodArray) {
                methodToString = methodToString + "[]";
            }
        }

        switch(methodReturn) {
            case "undefined":
                break;
            case "string":
                methodToString = methodToString + "String";
                break;
            case "integer":
                methodToString = methodToString + "Integer";
                break;
            case "float":
                methodToString = methodToString + "Float";
                break;
            case "boolean":
                methodToString = methodToString + "Boolean";
                break;
            case "datetime":
                methodToString = methodToString + "DateTime";
                break;
            case "void":
                methodToString = methodToString + "Void";
                break;
            default:
                methodToString = methodToString + methodReturn;
        }

        methodsToString.push(methodToString);
    });

    return methodsToString;
}

function parseMethodsToDefinition() {
    var methodsToDefinition = [];
    var methodToDefinition;

    $("#classmethods").children("div").each(function() {
        var methodReturn = $(this).children("#methodreturn").val();

        var methodName = $(this).children(".classmethod").val().trim();

        var isMethodArray = $(this).children(".ismethodarray").is(':checked');

        var methodParams = [];
        var methodParam;

        $(this).children("#methodparams").children("div").each(function() {
            var attributeType = $(this).children("#attributetype").val();

            var attributeName = $(this).children(".classattribute").val().trim();

            var isParamArray = $(this).children(".isparameterarray").is(':checked');

            methodParam = { 'attributeName': attributeName, 'attributeType': attributeType, 'isArray' : isParamArray};
            
            methodParams.push(methodParam);

        });

        methodToDefinition = { 'methodName': methodName, 'methodType': methodReturn, 'methodParameters' : methodParams, 'isArray' : isMethodArray};

        methodsToDefinition.push(methodToDefinition);
    });

    return methodsToDefinition;
}

function checkIfClassIsUsed(className) {

    var allClasses = graph.getCells().filter(function(item) {
        var itemType = item.prop("type");

        return item.prop("name") != className && (itemType === "uml.Class" || itemType === "uml.Abstract" || itemType === "uml.Interface");
    });

    var usage = [];

    allClasses.forEach(singleClass => {

        singleClass.prop("attributesDefinition").forEach(attribute => {
            if (attribute.attributeType == className) {
                usage.push("[Attribute] " + singleClass.prop("name") + "->" + attribute.attributeName);
            }
        });

        singleClass.prop("methodsDefinition").forEach(method => {
            if (method.methodType == className) {
                usage.push("[Method] " + singleClass.prop("name") + "->" + method.methodName);
            }

            method.methodParameters.forEach(methodParameter => {
                if (methodParameter.attributeType == className) {
                    usage.push("[Method Parameter] " + singleClass.prop("name") + "->" + method.methodName + "->" + methodParameter.attributeName);
                }
            });
        });
    });

    return usage;

}

function editRelationship(relationshipType, name, sourceMultiplicityMin, sourceMultiplicityMax, targetMultiplicityMin, targetMultiplicityMax) {

    var linkModel = graph.getCell(currentlyEditingRelationship);

    var linkLabels = linkModel.labels();

    var sourceMultiplicityText = sourceMultiplicityMin;
    var targetMultiplicityText = targetMultiplicityMin;

    if (sourceMultiplicityMax != "") {
        sourceMultiplicityText = sourceMultiplicityText + ".." + sourceMultiplicityMax;
    }
    
    if (targetMultiplicityMax != "") {
        targetMultiplicityText = targetMultiplicityText + ".." + targetMultiplicityMax;
    }

    linkLabels.forEach((linkLabel, labelIndex) => {
        if (linkLabel.labelPurpose === "relationshipName") {
            linkModel.label(labelIndex, { 
                attrs: { 
                    text: { 
                        text: name 
                    } 
                } 
            });
        }
        else if (linkLabel.labelPurpose === "sourceMultiplicity") {
            linkModel.label(labelIndex, { 
                attrs: { 
                    text: { 
                        text: sourceMultiplicityText 
                    } 
                },
                multiplicity: {
                    min: sourceMultiplicityMin,
                    max: sourceMultiplicityMax
                }
            });
        }
        else if (linkLabel.labelPurpose === "targetMultiplicity") {
            linkModel.label(labelIndex, { 
                attrs: { 
                    text: { 
                        text: targetMultiplicityText 
                    } 
                },
                multiplicity: {
                    min: targetMultiplicityMin,
                    max: targetMultiplicityMax
                }
            });
        }
        else {
            throw "Invalid label purpose.";
        }
    });

    var relTypeLabel = "uml." + relationshipType[0].toUpperCase() + relationshipType.slice(1);

    if (linkModel.prop("type") != relTypeLabel) {

        var newRelationship;

        switch(relationshipType)
        {
            case "generalization":
                newRelationship = new uml.Generalization({ 
                    source: { 
                        id: linkModel.prop("source/id")
                    }, 
                    target: { 
                        id: linkModel.prop("target/id")
                    }
                });
                break;
            case "implementation":
                newRelationship = new uml.Implementation({ 
                    source: { 
                        id: linkModel.prop("source/id")
                    }, 
                    target: { 
                        id: linkModel.prop("target/id")
                    }
                });
                break;
            case "aggregation":
                newRelationship = new uml.Aggregation({ 
                    source: { 
                        id: linkModel.prop("source/id")
                    }, 
                    target: { 
                        id: linkModel.prop("target/id")
                    }
                });
                break;
            case "composition":
                newRelationship = new uml.Composition({ 
                    source: { 
                        id: linkModel.prop("source/id")
                    }, 
                    target: { 
                        id: linkModel.prop("target/id")
                    }
                });
                break;
            case "association":
                newRelationship = new uml.Association({ 
                    source: { 
                        id: linkModel.prop("source/id")
                    }, 
                    target: { 
                        id: linkModel.prop("target/id")
                    }
                });
                break;
            default:
                throw "Unknown Relation Type";
        }

        newRelationship.prop("vertices", linkModel.prop("vertices"));
        newRelationship.prop("labels", linkModel.prop("labels"));

        linkModel.remove();
        graph.addCell(newRelationship);
    }

}

function showNewClassEditor() {
    if ($("#popUp").children("#newClass").length != 0) {
        return;
    }

    var newClassHtml = `<div id = \"newClass\" class=\"popup\">
        <h1>New class</h1>
        <br>
        <form id=\"newFormClass\">
            <label for=\"classtype\">Class type:</label>
            <select name=\"classtype\" id=\"classtype\">
                <option value=\"class\">Class</option>
                <option value=\"abstractClass\">Abstract Class</option>
                <option value=\"interface\">Interface</option>
            </select><br>
            <label for=\"classname\">Class name:</label>
            <input type=\"text\" id=\"classname\" name=\"classname\" ><br>
            <label for=\"classattributes\">Class attributes:</label><button id=\"newClassAttribute\">+</button>
            <div id=\"classattrs\"></div>
            <label for=\"classmethods\">Class methods:</label><button id=\"newClassMethod\">+</button>
            <div id=\"classmethods\"></div>
            <br>
            <button id=\"submitNewClass\">OK</button>
            <button id=\"closePopUp\">Cancel</button>
        </form>
    </div>`;
    $("#popUp").append(newClassHtml);
}

function showClassRemovalWarning(usage) {

    var listOfUsage = usage.join("<br>");

    var warningHtml = `<div class=\"popup\">
        <h1>Error - can't remove class</h1>
        <br>
        Can't remove class as it's being used as a data type for the following:
        <br><br>` +
        listOfUsage +
        `<br><br><button id=\"closePopUp\">OK</button>
    </div>`;

    $("#popUp").append(warningHtml);

}

function showLoadEditor() {
    $("#popUp").empty();

    var newClassHtml = `<div class=\"popup\">
        <h1>Save/load graph or send for grading</h1>
        <br>
        <label for="saveGraph">Save graph: </label>
        <button id=\"saveGraph\">Download</button>
        <br>
        <label for="uploadGraph">Load graph from file: </label>
        <input type="file" id="loadGraph" name="uploadGraph" accept=".txt">
        <br>
        <label for="uploadGraphExample">Load example graph: </label>
        <select name=\"uploadGraphExample\" id=\"uploadGraphExample\">
            <option value=\"Borza\">Borza</option>
        </select><button id="loadExample">Load</button>
        <br>
        <label for="graphName">Send for grading: </label>
        <input type="text" id="graphName" name="graphName">
        <button id="sendToServer">Send</button>
        <br>
        <button id=\"closePopUp\">Cancel</button>
    </div>`;
    $("#popUp").append(newClassHtml);
}

function fitElementsIntoWindow() {
    graph.getCells().forEach(cell => {

        var cellType = cell.prop("type");

        //if it's a class, reposition it
        if(cellType === "uml.Class" || cellType === "uml.Abstract" || cellType === "uml.Interface") {
            var currentX = cell.prop("position/x") + cell.prop("size/width");
            var currentY = cell.prop("position/y") + cell.prop("size/height");

            if (currentX > $(window).width()) {
                cell.position($(window).width() - cell.prop("size/width"), cell.prop("position/y"));
            }
            if (currentY > $(window).height()) {
                cell.position(cell.prop("position/x"), $(window).height() - cell.prop("size/height"));
            }
        }
        //if it's a link, check vertices and remove them if needed
        else {
            var linkVertices = cell.prop("vertices");

            var newVertices = [];

            linkVertices.forEach(linkVertex => {

                if ((linkVertex.x < $(window).width()) && (linkVertex.y < $(window).height())) {
                    newVertices.push(linkVertex);
                }
            });

            cell.vertices(newVertices);
        }
        
    });
}

function composeClassEditWindow(classModel) {

    var popUpDiv = document.createElement("div");
    popUpDiv.setAttribute("id", "editClass");
    popUpDiv.setAttribute("class", "popup");

    var title = document.createElement("h1");
    title.innerText = "Edit class";

    var form = document.createElement("form");
    form.setAttribute("id", "editFormClass");

    var classType = document.createElement("label");
    classType.setAttribute("for", "classtype");
    classType.innerText = "Class type:";

    var classTypeSelect = document.createElement("select");
    classTypeSelect.setAttribute("name", "classtype");
    classTypeSelect.setAttribute("id", "classtype");

    var selectTypeOptionClass = document.createElement("option");
    selectTypeOptionClass.setAttribute("value", "class");
    selectTypeOptionClass.innerText = "Class";

    var selectTypeOptionAbstract = document.createElement("option");
    selectTypeOptionAbstract.setAttribute("value", "abstractClass");
    selectTypeOptionAbstract.innerText = "Abstract Class";

    var selectTypeOptionInterface = document.createElement("option");
    selectTypeOptionInterface.setAttribute("value", "interface");
    selectTypeOptionInterface.innerText = "Interface";

    switch(classModel.prop("type")) {
        case "uml.Class":
            selectTypeOptionClass.setAttribute("selected", true);
            break;
        case "uml.Abstract":
            selectTypeOptionAbstract.setAttribute("selected", true);
            break;
        case "uml.Interface":
            selectTypeOptionInterface.setAttribute("selected", true);
            break;
    }

    classTypeSelect.appendChild(selectTypeOptionClass);
    classTypeSelect.appendChild(selectTypeOptionAbstract);
    classTypeSelect.appendChild(selectTypeOptionInterface);

    var inputClassName = document.createElement("input");
    inputClassName.setAttribute("type", "text");
    inputClassName.setAttribute("id", "classname");
    inputClassName.setAttribute("name", "classname");
    inputClassName.value = classModel.prop("name");

    var className = document.createElement("label");
    className.setAttribute("for", "classname");
    className.innerText = "Class name:";

    var classAttributes = document.createElement("label");
    classAttributes.setAttribute("for", "classattributes");
    classAttributes.innerText = "Class attributes:";

    var addAttr = document.createElement("button");
    addAttr.setAttribute("id", "newClassAttribute");
    addAttr.innerText = "+";

    var classMethods = document.createElement("label");
    classMethods.setAttribute("for", "classmethods");
    classMethods.innerText = "Class methods:";

    var addMthd = document.createElement("button");
    addMthd.setAttribute("id", "newClassMethod");
    addMthd.innerText = "+";

    var submitButton = document.createElement("button");
    submitButton.setAttribute("id", "submitClassEdit");
    submitButton.innerText = "OK";

    var cancelButton = document.createElement("button");
    cancelButton.setAttribute("id", "closePopUp");
    cancelButton.innerText = "Cancel";

    var deleteButton = document.createElement("button");
    deleteButton.setAttribute("id", "deleteEntity");
    deleteButton.innerText = "Delete";

    var attrsDiv = document.createElement("div");
    attrsDiv.setAttribute("id", "classattrs");

    var methodsDiv = document.createElement("div");
    methodsDiv.setAttribute("id", "classmethods");

    var classAttrs = classModel.prop("attributesDefinition");

    classAttrs.forEach(attr => {
        var attrDiv = document.createElement("div");

        var inputAttrString = document.createElement("input");
        inputAttrString.setAttribute("type", "text");
        inputAttrString.setAttribute("name", "classattribute");
        inputAttrString.setAttribute("class", "classattribute");
        inputAttrString.value = attr.attributeName;

        var inputAttrType = document.createElement("select");
        inputAttrType.setAttribute("name", "attributetype");
        inputAttrType.setAttribute("id", "attributetype");

        var selectOptionBlank = document.createElement("option");
        selectOptionBlank.setAttribute("value", "undefined");
        selectOptionBlank.innerText = "--";

        var selectOptionString = document.createElement("option");
        selectOptionString.setAttribute("value", "string");
        selectOptionString.innerText = "String";

        var selectOptionInt = document.createElement("option");
        selectOptionInt.setAttribute("value", "integer");
        selectOptionInt.innerText = "Integer";

        var selectOptionFloat = document.createElement("option");
        selectOptionFloat.setAttribute("value", "float");
        selectOptionFloat.innerText = "Float";

        var selectOptionDateTime = document.createElement("option");
        selectOptionDateTime.setAttribute("value", "datetime");
        selectOptionDateTime.innerText = "DateTime";

        var selectOptionBool = document.createElement("option");
        selectOptionBool.setAttribute("value", "boolean");
        selectOptionBool.innerText = "Boolean";

        switch(attr.attributeType) {
            case "undefined":
                selectOptionBlank.setAttribute("selected", true);
                break;
            case "string":
                selectOptionString.setAttribute("selected", true);
                break;
            case "integer":
                selectOptionInt.setAttribute("selected", true);
                break;
            case "float":
                selectOptionFloat.setAttribute("selected", true);
                break;
            case "boolean":
                selectOptionBool.setAttribute("selected", true);
                break;
            case "datetime":
                selectOptionDateTime.setAttribute("selected", true);
                break;
            default:
                break;
        }

        var isAttrArrayCheckbox = document.createElement("input");
        isAttrArrayCheckbox.setAttribute("type", "checkbox");
        isAttrArrayCheckbox.setAttribute("name", "isattributearray");
        isAttrArrayCheckbox.setAttribute("class", "isattributearray");

        var isAttrArrayLabel = document.createElement("label");
        isAttrArrayLabel.setAttribute("for", "isattributearray");
        isAttrArrayLabel.innerText = "Array";

        if (attr.isArray) {
            isAttrArrayCheckbox.setAttribute("checked", true);
        }

        inputAttrType.appendChild(selectOptionBlank);
        inputAttrType.appendChild(selectOptionString);
        inputAttrType.appendChild(selectOptionInt);
        inputAttrType.appendChild(selectOptionFloat);
        inputAttrType.appendChild(selectOptionDateTime);
        inputAttrType.appendChild(selectOptionBool);

        var existingClassesNames = graph.getCells().filter(function(item) {
            var itemType = item.prop("type");
            return itemType === "uml.Class" || itemType === "uml.Abstract" || itemType === "uml.Interface";
        }).map(function(item) {
            return item.prop("name");
        });

        existingClassesNames.forEach(existingClassName => {
            
            var classDataType = document.createElement("option");
            classDataType.setAttribute("value", existingClassName);
            classDataType.innerText = existingClassName;

            if (attr.attributeType == existingClassName) {
                classDataType.setAttribute("selected", true);
            }
            
            inputAttrType.appendChild(classDataType);

        });

        var deleteButton = document.createElement("button");
        deleteButton.setAttribute("id", "removeTextInput");
        deleteButton.innerText = "-";

        attrDiv.appendChild(isAttrArrayCheckbox);
        attrDiv.appendChild(isAttrArrayLabel);
        attrDiv.appendChild(inputAttrType);
        attrDiv.appendChild(inputAttrString);
        attrDiv.appendChild(deleteButton);

        attrsDiv.appendChild(attrDiv);
    });

    var classMthds = classModel.prop("methodsDefinition");

    classMthds.forEach(mthd => {

        var mthdDiv = document.createElement("div");

        var inputMthdString = document.createElement("input");
        inputMthdString.setAttribute("type", "text");
        inputMthdString.setAttribute("name", "classmethods");
        inputMthdString.setAttribute("class", "classmethod");
        inputMthdString.value = mthd.methodName;

        var inputMthdType = document.createElement("select");
        inputMthdType.setAttribute("name", "methodreturn");
        inputMthdType.setAttribute("id", "methodreturn");

        var selectOptionBlank = document.createElement("option");
        selectOptionBlank.setAttribute("value", "undefined");
        selectOptionBlank.innerText = "--";

        var selectOptionString = document.createElement("option");
        selectOptionString.setAttribute("value", "string");
        selectOptionString.innerText = "String";

        var selectOptionInt = document.createElement("option");
        selectOptionInt.setAttribute("value", "integer");
        selectOptionInt.innerText = "Integer";

        var selectOptionFloat = document.createElement("option");
        selectOptionFloat.setAttribute("value", "float");
        selectOptionFloat.innerText = "Float";

        var selectOptionDateTime = document.createElement("option");
        selectOptionDateTime.setAttribute("value", "datetime");
        selectOptionDateTime.innerText = "DateTime";

        var selectOptionBool = document.createElement("option");
        selectOptionBool.setAttribute("value", "boolean");
        selectOptionBool.innerText = "Boolean";

        var selectOptionVoid = document.createElement("option");
        selectOptionVoid.setAttribute("value", "void");
        selectOptionVoid.innerText = "Void";

        var isMethodArrayCheckbox = document.createElement("input");
        isMethodArrayCheckbox.setAttribute("type", "checkbox");
        isMethodArrayCheckbox.setAttribute("name", "ismethodarray");
        isMethodArrayCheckbox.setAttribute("class", "ismethodarray");

        var isMethodArrayLabel = document.createElement("label");
        isMethodArrayLabel.setAttribute("for", "ismethodarray");
        isMethodArrayLabel.innerText = "Array";

        if (mthd.isArray == true) {
            isMethodArrayCheckbox.setAttribute("checked", true);
        }

        switch(mthd.methodType) {
            case "undefined":
                selectOptionBlank.setAttribute("selected", true);
                break;
            case "string":
                selectOptionString.setAttribute("selected", true);
                break;
            case "integer":
                selectOptionInt.setAttribute("selected", true);
                break;
            case "float":
                selectOptionFloat.setAttribute("selected", true);
                break;
            case "boolean":
                selectOptionBool.setAttribute("selected", true);
                break;
            case "datetime":
                selectOptionDateTime.setAttribute("selected", true);
                break;
            case "void":
                selectOptionVoid.setAttribute("selected", true);
                break;
            default:
                break;
        }

        inputMthdType.appendChild(selectOptionBlank);
        inputMthdType.appendChild(selectOptionString);
        inputMthdType.appendChild(selectOptionInt);
        inputMthdType.appendChild(selectOptionFloat);
        inputMthdType.appendChild(selectOptionDateTime);
        inputMthdType.appendChild(selectOptionBool);
        inputMthdType.appendChild(selectOptionVoid);

        var existingClassesNames = graph.getCells().filter(function(item) {
            var itemType = item.prop("type");
            return itemType === "uml.Class" || itemType === "uml.Abstract" || itemType === "uml.Interface";
        }).map(function(item) {
            return item.prop("name");
        });

        existingClassesNames.forEach(existingClassName => {
            
            var classDataType = document.createElement("option");
            classDataType.setAttribute("value", existingClassName);
            classDataType.innerText = existingClassName;

            if (mthd.methodType == existingClassName) {
                classDataType.setAttribute("selected", true);
            }
            
            inputMthdType.appendChild(classDataType);

        });

        var methodParams = mthd.methodParameters;

        var mthdParamsDiv = document.createElement("div");
        mthdParamsDiv.setAttribute("id", "methodparams");

        methodParams.forEach(methodParam => {
            var methodparamDiv = document.createElement("div");

            var inputParamString = document.createElement("input");
            inputParamString.setAttribute("type", "text");
            inputParamString.setAttribute("name", "classattribute");
            inputParamString.setAttribute("class", "classattribute");
            inputParamString.value = methodParam.attributeName;

            var inputParamType = document.createElement("select");
            inputParamType.setAttribute("name", "attributetype");
            inputParamType.setAttribute("id", "attributetype");

            var selectOptionBlank = document.createElement("option");
            selectOptionBlank.setAttribute("value", "undefined");
            selectOptionBlank.innerText = "--";

            var selectOptionString = document.createElement("option");
            selectOptionString.setAttribute("value", "string");
            selectOptionString.innerText = "String";

            var selectOptionInt = document.createElement("option");
            selectOptionInt.setAttribute("value", "integer");
            selectOptionInt.innerText = "Integer";

            var selectOptionFloat = document.createElement("option");
            selectOptionFloat.setAttribute("value", "float");
            selectOptionFloat.innerText = "Float";

            var selectOptionDateTime = document.createElement("option");
            selectOptionDateTime.setAttribute("value", "datetime");
            selectOptionDateTime.innerText = "DateTime";

            var selectOptionBool = document.createElement("option");
            selectOptionBool.setAttribute("value", "boolean");
            selectOptionBool.innerText = "Boolean";

            switch(methodParam.attributeType) {
                case "undefined":
                    selectOptionBlank.setAttribute("selected", true);
                    break;
                case "string":
                    selectOptionString.setAttribute("selected", true);
                    break;
                case "integer":
                    selectOptionInt.setAttribute("selected", true);
                    break;
                case "float":
                    selectOptionFloat.setAttribute("selected", true);
                    break;
                case "datetime":
                    selectOptionDateTime.setAttribute("selected", true);
                    break;
                case "boolean":
                    selectOptionBool.setAttribute("selected", true);
                    break;
                default:
                    break;
            }

            var isParameterArrayCheckbox = document.createElement("input");
            isParameterArrayCheckbox.setAttribute("type", "checkbox");
            isParameterArrayCheckbox.setAttribute("name", "isparameterarray");
            isParameterArrayCheckbox.setAttribute("class", "isparameterarray");

            var isParameterArrayLabel = document.createElement("label");
            isParameterArrayLabel.setAttribute("for", "isparameterarray");
            isParameterArrayLabel.innerText = "Array";

            if (methodParam.isArray == true) {
                isParameterArrayCheckbox.setAttribute("checked", true);
            }

            inputParamType.appendChild(selectOptionBlank);
            inputParamType.appendChild(selectOptionString);
            inputParamType.appendChild(selectOptionInt);
            inputParamType.appendChild(selectOptionFloat);
            inputParamType.appendChild(selectOptionDateTime);
            inputParamType.appendChild(selectOptionBool);
    
            existingClassesNames.forEach(existingClassName => {
                
                var classDataTypeForParam = document.createElement("option");
                classDataTypeForParam.setAttribute("value", existingClassName);
                classDataTypeForParam.innerText = existingClassName;
    
                if (methodParam.attributeType == existingClassName) {
                    classDataTypeForParam.setAttribute("selected", true);
                }
                
                inputParamType.appendChild(classDataTypeForParam);
    
            });

            var deleteButton = document.createElement("button");
            deleteButton.setAttribute("id", "removeTextInput");
            deleteButton.innerText = "-";

            methodparamDiv.appendChild(isParameterArrayCheckbox);
            methodparamDiv.appendChild(isParameterArrayLabel);
            methodparamDiv.appendChild(inputParamType);
            methodparamDiv.appendChild(inputParamString);
            methodparamDiv.appendChild(deleteButton);

            mthdParamsDiv.appendChild(methodparamDiv);
        });

        var deleteButton = document.createElement("button");
        deleteButton.setAttribute("id", "removeTextInput");
        deleteButton.innerText = "-";

        var addMthdParam = document.createElement("button");
        addMthdParam.setAttribute("id", "addMethodParameter");
        addMthdParam.innerText = "+";

        mthdDiv.appendChild(document.createElement("br"));
        mthdDiv.appendChild(isMethodArrayCheckbox);
        mthdDiv.appendChild(isMethodArrayLabel);
        mthdDiv.appendChild(inputMthdType);
        mthdDiv.appendChild(inputMthdString);
        mthdDiv.appendChild(deleteButton);
        mthdDiv.appendChild(document.createElement("br"));

        mthdDiv.appendChild(document.createTextNode("Method input parameters:"));

        mthdDiv.appendChild(addMthdParam);
        mthdDiv.appendChild(mthdParamsDiv);

        methodsDiv.appendChild(mthdDiv);
    });

    form.appendChild(classType);
    form.appendChild(classTypeSelect);
    form.appendChild(document.createElement("br"));

    form.appendChild(className);
    form.appendChild(inputClassName);
    form.appendChild(document.createElement("br"));

    form.appendChild(classAttributes);
    form.appendChild(addAttr);
    form.appendChild(attrsDiv);

    form.appendChild(classMethods);
    form.appendChild(addMthd);
    form.appendChild(methodsDiv);

    form.appendChild(document.createElement("br"));
    form.appendChild(submitButton);
    form.appendChild(cancelButton);
    form.appendChild(deleteButton);

    popUpDiv.appendChild(title);
    popUpDiv.appendChild(document.createElement("br"));
    popUpDiv.appendChild(form);

    return popUpDiv;
}

function composeRelationshipEditWindow(linkModel) {

    var popUpDiv = document.createElement("div");
    popUpDiv.setAttribute("id", "editRelationship");
    popUpDiv.setAttribute("class", "popup");

    var title = document.createElement("h1");
    title.innerText = "Edit relationship";

    var form = document.createElement("form");
    form.setAttribute("id", "editFormRelationship");

    var relationshipName = document.createElement("label");
    relationshipName.setAttribute("for", "relationshipname");
    relationshipName.innerText = "Relationship name:";

    var inputRelationshipName = document.createElement("input");
    inputRelationshipName.setAttribute("type", "text");
    inputRelationshipName.setAttribute("id", "relationshipname");
    inputRelationshipName.setAttribute("name", "relationshipname");

    var relationshipTypeLabel = document.createElement("label");
    relationshipTypeLabel.setAttribute("for", "relationshipType");
    relationshipTypeLabel.innerText = "Relationship type:";

    var relationshipType = document.createElement("select");
    relationshipType.setAttribute("name", "relationshipType");
    relationshipType.setAttribute("id", "relationshipType");

    var generalizationType = document.createElement("option");
    generalizationType.setAttribute("value", "generalization");
    generalizationType.innerText = "Generalization";

    var implementationType = document.createElement("option");
    implementationType.setAttribute("value", "implementation");
    implementationType.innerText = "Implementation";

    var aggregationType = document.createElement("option");
    aggregationType.setAttribute("value", "aggregation");
    aggregationType.innerText = "Aggregation";

    var compositionType = document.createElement("option");
    compositionType.setAttribute("value", "composition");
    compositionType.innerText = "Composition";

    var associationType = document.createElement("option");
    associationType.setAttribute("value", "association");
    associationType.innerText = "Association";

    switch(linkModel.prop("type")) {
        case "uml.Generalization":
            generalizationType.setAttribute("selected", true);
            break;
        case "uml.Implementation":
            implementationType.setAttribute("selected", true);
            break;
        case "uml.Aggregation":
            aggregationType.setAttribute("selected", true);
            break;
        case "uml.Composition":
            compositionType.setAttribute("selected", true);
            break;
        case "uml.Association":
            associationType.setAttribute("selected", true);
            break;
    }

    relationshipType.appendChild(generalizationType);
    relationshipType.appendChild(implementationType);
    relationshipType.appendChild(aggregationType);
    relationshipType.appendChild(compositionType);
    relationshipType.appendChild(associationType);

    var labels = linkModel.labels();

    labels.forEach(label => {
        if (label.labelPurpose === "relationshipName") {
            inputRelationshipName.value = label.attrs.text.text;
        }
    });

    form.appendChild(relationshipTypeLabel);
    form.appendChild(relationshipType);
    form.appendChild(document.createElement("br"));

    form.appendChild(relationshipName);
    form.appendChild(inputRelationshipName);
    form.appendChild(document.createElement("br"));

    var sourceMultiplicityDiv = document.createElement("div");
    sourceMultiplicityDiv.setAttribute("id", "sourcemultiplicitydiv");

    var targetMultiplicityDiv = document.createElement("div");
    targetMultiplicityDiv.setAttribute("id", "targetmultiplicitydiv");

    if (linkModel.prop("type") != "uml.Generalization" && linkModel.prop("type") != "uml.Implementation") { 
        
        var sourceClassModel = graph.getCell(linkModel.prop("source/id"));
        var targetClassModel = graph.getCell(linkModel.prop("target/id"));

        var sourceMultiplicityMin = document.createElement("label");
        sourceMultiplicityMin.setAttribute("for", "sourcemultiplicitymin");
        sourceMultiplicityMin.innerText = "Min:";

        var inputSourceMultiplicityMin = document.createElement("input");
        inputSourceMultiplicityMin.setAttribute("type", "text");
        inputSourceMultiplicityMin.setAttribute("id", "sourcemultiplicitymin");
        inputSourceMultiplicityMin.setAttribute("name", "sourcemultiplicitymin");

        var sourceMultiplicityMax = document.createElement("label");
        sourceMultiplicityMax.setAttribute("for", "sourcemultiplicitymax");
        sourceMultiplicityMax.innerText = "Max:";

        var inputSourceMultiplicityMax = document.createElement("input");
        inputSourceMultiplicityMax.setAttribute("type", "text");
        inputSourceMultiplicityMax.setAttribute("id", "sourcemultiplicitymax");
        inputSourceMultiplicityMax.setAttribute("name", "sourcemultiplicitymax");

        var targetMultiplicityMin = document.createElement("label");
        targetMultiplicityMin.setAttribute("for", "targetmultiplicitymin");
        targetMultiplicityMin.innerText = "Min:";

        var inputTargetMultiplicityMin = document.createElement("input");
        inputTargetMultiplicityMin.setAttribute("type", "text");
        inputTargetMultiplicityMin.setAttribute("id", "targetmultiplicitymin");
        inputTargetMultiplicityMin.setAttribute("name", "targetmultiplicitymin");

        var targetMultiplicityMax = document.createElement("label");
        targetMultiplicityMax.setAttribute("for", "targetmultiplicitymax");
        targetMultiplicityMax.innerText = "Max:";

        var inputTargetMultiplicityMax = document.createElement("input");
        inputTargetMultiplicityMax.setAttribute("type", "text");
        inputTargetMultiplicityMax.setAttribute("id", "targetmultiplicitymax");
        inputTargetMultiplicityMax.setAttribute("name", "targetmultiplicitymax");

        labels.forEach(label => {
            if (label.labelPurpose === "sourceMultiplicity") {
                inputSourceMultiplicityMin.value = label.multiplicity.min;
                inputSourceMultiplicityMax.value = label.multiplicity.max;
            }
            else if (label.labelPurpose === "targetMultiplicity") {
                inputTargetMultiplicityMin.value = label.multiplicity.min;
                inputTargetMultiplicityMax.value = label.multiplicity.max;
            }
        });

        sourceMultiplicityDiv.appendChild(document.createTextNode("Source [" + sourceClassModel.prop("name") + "] multiplicity:"));
        sourceMultiplicityDiv.appendChild(document.createElement("br"));
        sourceMultiplicityDiv.appendChild(sourceMultiplicityMin);
        sourceMultiplicityDiv.appendChild(inputSourceMultiplicityMin);
        sourceMultiplicityDiv.appendChild(document.createElement("br"));
        sourceMultiplicityDiv.appendChild(sourceMultiplicityMax);
        sourceMultiplicityDiv.appendChild(inputSourceMultiplicityMax);

        sourceMultiplicityDiv.appendChild(document.createElement("br"));
        sourceMultiplicityDiv.appendChild(document.createElement("br"));

        targetMultiplicityDiv.appendChild(document.createTextNode("Target [" + targetClassModel.prop("name") + "] multiplicity:"));
        targetMultiplicityDiv.appendChild(document.createElement("br"));
        targetMultiplicityDiv.appendChild(targetMultiplicityMin);
        targetMultiplicityDiv.appendChild(inputTargetMultiplicityMin);
        targetMultiplicityDiv.appendChild(document.createElement("br"));
        targetMultiplicityDiv.appendChild(targetMultiplicityMax);
        targetMultiplicityDiv.appendChild(inputTargetMultiplicityMax);
        targetMultiplicityDiv.appendChild(document.createElement("br"));
        targetMultiplicityDiv.appendChild(document.createElement("br"));

    }

    form.appendChild(sourceMultiplicityDiv);
    form.appendChild(targetMultiplicityDiv);

    var submitButton = document.createElement("button");
    submitButton.setAttribute("id", "submitRelationshipEdit");
    submitButton.innerText = "OK";

    var cancelButton = document.createElement("button");
    cancelButton.setAttribute("id", "closePopUp");
    cancelButton.innerText = "Cancel";

    var deleteButton = document.createElement("button");
    deleteButton.setAttribute("id", "deleteRelationship");
    deleteButton.innerText = "Delete";

    form.appendChild(submitButton);
    form.appendChild(cancelButton);
    form.appendChild(deleteButton);

    popUpDiv.appendChild(title);
    popUpDiv.appendChild(document.createElement("br"));
    popUpDiv.appendChild(form);

    return popUpDiv;
}

function addMultiplicityToRelationshipEdit() {
    var linkModel = graph.getCell(currentlyEditingRelationship);

    var sourceMultiplicityDiv = $("#sourcemultiplicitydiv");
    var targetMultiplicityDiv = $("#targetmultiplicitydiv");

    var sourceMultiplicityMin = document.createElement("label");
    sourceMultiplicityMin.setAttribute("for", "sourcemultiplicitymin");
    sourceMultiplicityMin.innerText = "Min:";

    var inputSourceMultiplicityMin = document.createElement("input");
    inputSourceMultiplicityMin.setAttribute("type", "text");
    inputSourceMultiplicityMin.setAttribute("id", "sourcemultiplicitymin");
    inputSourceMultiplicityMin.setAttribute("name", "sourcemultiplicitymin");

    var sourceMultiplicityMax = document.createElement("label");
    sourceMultiplicityMax.setAttribute("for", "sourcemultiplicitymax");
    sourceMultiplicityMax.innerText = "Max:";

    var inputSourceMultiplicityMax = document.createElement("input");
    inputSourceMultiplicityMax.setAttribute("type", "text");
    inputSourceMultiplicityMax.setAttribute("id", "sourcemultiplicitymax");
    inputSourceMultiplicityMax.setAttribute("name", "sourcemultiplicitymax");

    var targetMultiplicityMin = document.createElement("label");
    targetMultiplicityMin.setAttribute("for", "targetmultiplicitymin");
    targetMultiplicityMin.innerText = "Min:";

    var inputTargetMultiplicityMin = document.createElement("input");
    inputTargetMultiplicityMin.setAttribute("type", "text");
    inputTargetMultiplicityMin.setAttribute("id", "targetmultiplicitymin");
    inputTargetMultiplicityMin.setAttribute("name", "targetmultiplicitymin");

    var targetMultiplicityMax = document.createElement("label");
    targetMultiplicityMax.setAttribute("for", "targetmultiplicitymax");
    targetMultiplicityMax.innerText = "Max:";

    var inputTargetMultiplicityMax = document.createElement("input");
    inputTargetMultiplicityMax.setAttribute("type", "text");
    inputTargetMultiplicityMax.setAttribute("id", "targetmultiplicitymax");
    inputTargetMultiplicityMax.setAttribute("name", "targetmultiplicitymax");

    var labels = linkModel.labels();

    labels.forEach(label => {
        if (label.labelPurpose === "sourceMultiplicity") {
            inputSourceMultiplicityMin.value = label.multiplicity.min;
            inputSourceMultiplicityMax.value = label.multiplicity.max;
        }
        else if (label.labelPurpose === "targetMultiplicity") {
            inputTargetMultiplicityMin.value = label.multiplicity.min;
            inputTargetMultiplicityMax.value = label.multiplicity.max;
        }
    });

    var sourceClassModel = graph.getCell(linkModel.prop("source/id"));
    var targetClassModel = graph.getCell(linkModel.prop("target/id"));

    sourceMultiplicityDiv.append(document.createTextNode("Source [" + sourceClassModel.prop("name") + "] multiplicity:"));
    sourceMultiplicityDiv.append(document.createElement("br"));
    sourceMultiplicityDiv.append(sourceMultiplicityMin);
    sourceMultiplicityDiv.append(inputSourceMultiplicityMin);
    sourceMultiplicityDiv.append(document.createElement("br"));
    sourceMultiplicityDiv.append(sourceMultiplicityMax);
    sourceMultiplicityDiv.append(inputSourceMultiplicityMax);

    sourceMultiplicityDiv.append(document.createElement("br"));
    sourceMultiplicityDiv.append(document.createElement("br"));

    targetMultiplicityDiv.append(document.createTextNode("Target [" + targetClassModel.prop("name") + "] multiplicity:"));
    targetMultiplicityDiv.append(document.createElement("br"));
    targetMultiplicityDiv.append(targetMultiplicityMin);
    targetMultiplicityDiv.append(inputTargetMultiplicityMin);
    targetMultiplicityDiv.append(document.createElement("br"));
    targetMultiplicityDiv.append(targetMultiplicityMax);
    targetMultiplicityDiv.append(inputTargetMultiplicityMax);
    targetMultiplicityDiv.append(document.createElement("br"));
    targetMultiplicityDiv.append(document.createElement("br"));
}

$(document).ready(function(){
    $("body").on('click', "#submitClassEdit", function(e) {
        e.preventDefault();
        var attributesStringArray = parseAttributesToString();
        var attributesDefinitionArray = parseAttributesToDefinition();

        var methodsStringArray = parseMethodsToString();
        var methodsDefinitionArray = parseMethodsToDefinition();

        editClass($("#classtype").val(), $("#classname").val().trim(), attributesStringArray, attributesDefinitionArray, methodsStringArray, methodsDefinitionArray);
        currentlyEditingClass = null;
        $("#popUp").empty();
        return false;
    });

    $("body").on('click', "#showGuide", function(e) {
        e.preventDefault();
        
        $("#popUp").empty();

        var guideHtml = `<div class=\"popup\">Commands:
        <br>
        <ul>
            <li>Right click on paper: menu for saving, loading or grading a graph</li>
            <li>Double click on paper: create new class</li>
            <li>Double click on a class and then click on another class: draw a relationship between the two classes</li>
            <li>Click on gray info icon on class: edit/view class info</li>
            <li>Click on gray info icon on relationship: edit/view relationship info</li>
        </ul>
        <button id="closePopUp">Close</button></div>`;

        $("#popUp").append(guideHtml);

        return false;
    });

    $("body").on('click', "#submitNewClass", function(e) {
        e.preventDefault();
        var attributesStringArray = parseAttributesToString();
        var attributesDefinitionArray = parseAttributesToDefinition();

        var methodsStringArray = parseMethodsToString();
        var methodsDefinitionArray = parseMethodsToDefinition();

        addClass($("#classtype").val(), $("#classname").val().trim(), attributesStringArray, attributesDefinitionArray, methodsStringArray, methodsDefinitionArray);
        $("#popUp").empty();
        return false;
    });

    $("body").on('click', "#closePopUp", function(e) {
        e.preventDefault();
        $("#popUp").empty();
        currentlyEditingClass = null;
        currentlyEditingRelationship = null;
        return false;
    });

    $("body").on('click', "#newClassAttribute", function(e) {
        e.preventDefault();

        var existingClassesNames = graph.getCells().filter(function(item) {
            var itemType = item.prop("type");
            return itemType === "uml.Class" || itemType === "uml.Abstract" || itemType === "uml.Interface";
        }).map(function(item) {
            return item.prop("name");
        });

        var classOptions = existingClassesNames.map(function(item) {
            return "<option value=\"" + item + "\">" + item + "</option>";
        });

        var classOptionsHtml = classOptions.join();

        $("#classattrs").append(`<div>
        <input type=\"checkbox\" name=\"isattributearray\" class=\"isattributearray\"><label for=\"isattributearray\">Array</label>
        <select name=\"attributetype\" id=\"attributetype\">
            <option value=\"undefined\">--</option>
            <option value=\"string\">String</option>
            <option value=\"integer\">Integer</option>
            <option value=\"float\">Float</option>
            <option value=\"datetime\">DateTime</option>
            <option value=\"boolean\">Boolean</option>` + classOptionsHtml +
        `</select><input type=\"text\" name=\"classattribute\" class=\"classattribute\"><button id=\"removeTextInput\">-</button></div>`);

        return false;
    });

    $("body").on('click', "#newClassMethod", function(e) {
        e.preventDefault();

        var existingClassesNames = graph.getCells().filter(function(item) {
            var itemType = item.prop("type");
            return itemType === "uml.Class" || itemType === "uml.Abstract" || itemType === "uml.Interface";
        }).map(function(item) {
            return item.prop("name");
        });

        var classOptions = existingClassesNames.map(function(item) {
            return "<option value=\"" + item + "\">" + item + "</option>";
        });

        var classOptionsHtml = classOptions.join();

        $("#classmethods").append(`<div><br><input type=\"checkbox\" name=\"ismethodarray\" class=\"ismethodarray\"><label for=\"ismethodarray\">Array</label>
        <select name=\"methodreturn\" id=\"methodreturn\">
        <option value=\"undefined\">--</option>
        <option value=\"void\">Void</option>
        <option value=\"string\">String</option>
        <option value=\"integer\">Integer</option>
        <option value=\"float\">Float</option>
        <option value=\"datetime\">DateTime</option>
        <option value=\"boolean\">Boolean</option>` + classOptionsHtml +
        `</select><input type=\"text\" name=\"classmethod\" class=\"classmethod\"><button id=\"removeTextInput\">-</button>
        <br>Method input parameters:<button id=\"addMethodParameter\">+</button><div id=\"methodparams\"></div></div>`);
        return false;
    });

    $("body").on("click", "#addMethodParameter", function(e){
        e.preventDefault();

        var existingClassesNames = graph.getCells().filter(function(item) {
            var itemType = item.prop("type");
            return itemType === "uml.Class" || itemType === "uml.Abstract" || itemType === "uml.Interface";
        }).map(function(item) {
            return item.prop("name");
        });

        var classOptions = existingClassesNames.map(function(item) {
            return "<option value=\"" + item + "\">" + item + "</option>";
        });

        var classOptionsHtml = classOptions.join();
        
        $(this).parent().children("#methodparams").append(`<div>
        <input type=\"checkbox\" name=\"isparameterarray\" class=\"isparameterarray\"><label for=\"isparameterarray\">Array</label>
        <select name=\"attributetype\" id=\"attributetype\">
            <option value=\"undefined\">--</option>
            <option value=\"string\">String</option>
            <option value=\"integer\">Integer</option>
            <option value=\"float\">Float</option>
            <option value=\"datetime\">DateTime</option>
            <option value=\"boolean\">Boolean</option>` + classOptionsHtml +
        `</select><input type=\"text\" name=\"classattribute\" class=\"classattribute\"><button id=\"removeTextInput\">-</button></div>`);

        return false;
    });

    $("body").on("click", "#removeTextInput", function(e){
        e.preventDefault();
        $(this).parent().remove();
        return false;
    });

    $("body").on("click", "#cancelNewRelationship", function(e){
        
        if (linkSource != null) {
            linkSource.unhighlight(null, customHighlighter);
        }

        drawingLink = false;
        linkSource = null;
        linkTarget = null;
        linkType = null;
        $("#popUp").empty();
    });

    $("body").on("click", "#submitRelationshipEdit", function(e) {
        e.preventDefault();

        var sourceMultiplicityMin = "";
        var sourceMultiplicityMax = "";
        var targetMultiplicityMin = "";
        var targetMultiplicityMax = "";

        if ($("#relationshipType").val() != "generalization" && $("#relationshipType").val() != "implementation") {
            sourceMultiplicityMin = $("#sourcemultiplicitymin").val().trim();
            sourceMultiplicityMax = $("#sourcemultiplicitymax").val().trim();
            targetMultiplicityMin = $("#targetmultiplicitymin").val().trim();
            targetMultiplicityMax = $("#targetmultiplicitymax").val().trim();

            if (sourceMultiplicityMin == "" && sourceMultiplicityMax != "") {
                sourceMultiplicityMin = "0";
            }
            if (targetMultiplicityMin == "" && targetMultiplicityMax != "") {
                targetMultiplicityMin = "0";
            }
        }

        editRelationship($("#relationshipType").val(), $("#relationshipname").val().trim(), sourceMultiplicityMin, sourceMultiplicityMax, targetMultiplicityMin, targetMultiplicityMax);
        currentlyEditingRelationship = null;
        $("#popUp").empty();
        return false;
    });

    $("body").on("click", "#deleteEntity", function(e) {
        e.preventDefault();
        graph.getCell(currentlyEditingClass).remove();
        currentlyEditingClass = null;
        $("#popUp").empty();
        return false;
    });

    $("body").on("click", "#deleteRelationship", function(e) {
        e.preventDefault();
        graph.getCell(currentlyEditingRelationship).remove();
        currentlyEditingRelationship = null;
        $("#popUp").empty();
        return false;
    });

    $("body").on('change', "#loadGraph", function(e) {
        e.preventDefault();

        var fr = new FileReader();

        fr.onload = function() {

            $("#popUp").empty();

            var graphJson = JSON.parse(fr.result);

            graph.fromJSON(graphJson);

            fitElementsIntoWindow();
        };

        fr.readAsText(this.files[0]);

        return false;
    });

    $("body").on('click', "#saveGraph", function(e) {
        e.preventDefault();

        var graphJson = JSON.stringify(graph.toJSON());

        download(graphJson, "graph.txt", "text/plain");

        $("#popUp").empty();
        return false;
    });

    $("body").on('click', "#loadExample", function(e) {
        e.preventDefault();

        var graphName = $("#uploadGraphExample").val();

        var httpRequest = new XMLHttpRequest();
        httpRequest.open("GET", "http://127.0.0.1:5000/ClassDiagram/Example?exampleGraphName=" + graphName, false);
        httpRequest.send();

        try {

            $("#popUp").empty();

            var serverResponse = JSON.parse(httpRequest.responseText);

            if (serverResponse.errorMessage != null) {
                throw serverResponse.errorMessage;
            }

            graph.fromJSON(serverResponse);

            fitElementsIntoWindow();

        }
        catch(e) {

            var errorLoadingHtml = `<div class=\"popup\">
            <h1>There was an error while trying to load the example:</h1>
            <br>` + e + `
            <br>
            <button id=\"closePopUp\">Close</button>
            </div>`;

            $("#popUp").append(errorLoadingHtml);
        }
        
        return false;
    });

    $("body").on('click', "#sendToServer", function(e) {
        e.preventDefault();

        var solutionGraph = graph.toJSON();

        var serverPayload = {'diagramName': $("#graphName").val().trim(), 'proposed': solutionGraph};

        var httpRequest = new XMLHttpRequest();
        httpRequest.open("POST", "http://127.0.0.1:5000/ClassDiagram/CompareToSolutionPrettyAnswer", false);
        httpRequest.setRequestHeader('Content-Type', 'application/json');
        httpRequest.send(JSON.stringify(serverPayload));

        $("#popUp").empty();

        var comparisonHtml = `<div class=\"popup\">
        <h1>Result</h1>
        <br>` + httpRequest.responseText + `
        <br>
        <button id=\"closePopUp\">Close</button>
        </div>`;

        $("#popUp").append(comparisonHtml);

        return false;
    });

    $("body").on("change", "#relationshipType", function(e) {
        e.preventDefault();

        if (this.value === "generalization" || this.value === "implementation") {

            if($('#sourcemultiplicitydiv').children().length > 0){
                $("#sourcemultiplicitydiv").empty();
                $("#targetmultiplicitydiv").empty();
            }
            
        }
        else {
            if($('#sourcemultiplicitydiv').children().length == 0){
                addMultiplicityToRelationshipEdit();
            }
        }

        return false;
    });

});

window.onresize = function(event) {

    fitElementsIntoWindow();

};