#!/bin/bash
THISDIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
docker run -it -h bwdb --name bwdb \
-v $THISDIR:/source/bwdb \
--entrypoint=/bin/bash \
bwdb -s
