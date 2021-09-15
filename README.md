# Diagram management and evaluation application
This README contains instructions for starting the application and a description of some files for the purpose of easing development of application updates.

## Application setup

1. Make sure you have Docker and Docker Compose installed (a guide can be found [HERE](https://docs.docker.com/compose/install/)).
1. Clone this repository.
1. Start CMD or PS in the root folder of the repository (where the '*docker-compose.yml*' file is located).
1. In CMD or PS run the command '*docker-compose up*'.
1. Check the logs in CMD or PS and make sure containers web-app and mongo-db are running.
1. Since database data persist is supported the database needs to be set up the first time it's started:
    1. Connect to the mongo-db container shell using the command '*docker exec -ti mongo-db bin/bash*'.
    1. Execute a script that restores the database from pre-prepared dump files using the command '*bash mongorestore.sh*'.
    1. If you want to test class diagram evaluation there is an example prepared -- change to the directory '*Example*' and run the command '*mongoimport --db umldiagramsdatabase --collection classdiagramsolutions --file graph.txt*'.
1. You can now start using the app. The home page is located on 'http://127.0.0.1:5000/'.

## Application files' description

1. The *docker-compose.yml* contains the configuration for setting up the app and database containers.
1. The '*App*' folder contains all files related to the JavaScript application, and a Dockerfile containing instructions for web-app container setup:
    1. The '*src*' folder contains the JavaScript server file '*server.js*'. It serves client-side files, returns diagram examples from the database, and handles diagram evaluation.
    1. The '*index.html*' file and '*css*' folder are used for the home page.
    1. The '*JSLibrary*' folder contains all third party libraries used in the solution ('*JointJS*' for diagram handling, and '*downlad.js*' for downloading files to a local directory, respectively).
    1. The '*Diagrams*' folder contains client side files that handle individual graph logic.
        1. The '*ClassDiagram*' folder contains files for handling UML class diagrams. In the '*src*' folder you can find the '*classdiagram.js*' file that handles all logic for the class diagram and handles requests to the server.
1. The '*Database*' folder contains all files related to the MongoDB database, and a Dockerfile containing instructions for mongo-db container setup:
    1. The '*Database*' folder contains individual folders that contain database/collection dumps for the respective diagramming techniques. Each folder is named after the collection.
    1. The '*Example*' contains example diagram definitions that can be then manually imported into the database
    1. The '*mongorestore.sh*' is a bash script that restores the database from the folders in '*Database*'
