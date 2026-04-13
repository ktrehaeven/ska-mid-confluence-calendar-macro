# ska-low-confluence-calendar-macro

Development on a confluence macro to link the existing SKA-Low calendar bookings with an interactive map of SKA-Low stations.

## Setup local instance of Confluence

Navigate to the top level of the directory in a terminal.

`atlas-run`

Go to [url](http://localhost:1990/confluence/plugins/servlet/upm) in your browser.

Login with username: admin, password: admin.

## Build package

Navigate to the top level of the directory in another terminal.

`atlas-mvn package`

Macros should now be available in the Confluence instance under SKA-Low Station Bookings and SKA-Low Map.
