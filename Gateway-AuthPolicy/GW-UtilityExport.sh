#!/bin/bash
#read -p 'Please Enter Folder to Export: ' FOLDER
export GRAPHMAN_HOME=../../../graphman-client-main
read -p 'Please Enter Source Gateway: ' source
echo "Given Namespace $source"

echo "Exporting the Gateway Utility Resources"
../../../graphman-client-main/graphman.sh export --gateway $source --using folder:full --variables.folderPath /Gateway-Utility --output ./GW-Utility.json
