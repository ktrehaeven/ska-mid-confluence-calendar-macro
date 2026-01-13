# ska-low-confluence-calendar-macro

Development on a confluence macro to link the existing SKA-Low calendar bookings with an interactive map of SKA-Low stations.

## Setup

`atlas-build`
http://localhost:1990/confluence/plugins/servlet/upm/manage/all
username: admin, password: admin
`atlas-mvn package`

## Development files

pom.xml
/src/main/resources/atlassian-plugin.xml
src/main/resources/ska-low-confluence-calendar-macro.properties
src/main/java/com/skao/confluence/plugins/macro/*.java
