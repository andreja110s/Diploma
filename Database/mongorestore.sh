#!/bin/bash

for DatabaseName in Database/*/; do
	echo "Name of database to drop: $(basename $DatabaseName)"
	mongo $(basename $DatabaseName) --eval "db.dropDatabase()"
	echo "Done with database drop"
done

mongorestore /Database

echo "Done with database restore"