# ska-low-confluence-calendar-macro

A custom Confluence Data Center plugin designed to improve the user experience using Confluence calendars to make and monitor bookings on SKA-Low stations prior to the deployment of the Observatory Science Operations (OSO) software suite. The plugin provides two macros; a resource assignment view showing which stations are assigned to calendar events, combined with an interactive map of the SKA-Low telescope.

Calendar data is stored on Confluence and interacted with through the [REST API](https://developer.atlassian.com/server/confluence/confluence-server-rest-api/) in the same way as in-built Confluence calendars interfaces. This is purely an interface and does not change the way this data stored. Access permissions are inherited from the active user's session. The station assignments of existing events are determined by applying regex searches to the "title", "description" fields. Events created or edited through this tool will save the assignments in the "where" field.

This is developed using the [Atlassian Plugin SDK](https://developer.atlassian.com/server/framework/atlassian-sdk/set-up-the-atlassian-plugin-sdk-and-build-a-project/) and uses open-source JavaScript packages [Leaflet](leafletjs.com) and [DayPilot Lite](https://javascript.daypilot.org/open-source/).

## Local Installation

Clone this repository and navigate to the top level of the directory in a terminal.

`atlas-run` will setup a fresh local instance of Confluence.

Go to the [local url](http://localhost:1990/confluence/plugins/servlet/upm) in your browser. Login with username: admin, password: admin.

## Packaging

Navigate to the top level of the directory in another terminal.

`atlas-mvn package` will package the macro into a .jar and .obr file. These are automatically installed onto the local Confluence instance and can now be added to a page by searching for SKA-Low Station Bookings and SKA-Low Map in the macro browser. A calendar will need to be imported or created on the Confluence instance to view events on the macro.

## Deployment

Use `atlas-mvn clean package` to package for deployment onto an external Confluence, which ensures there are no conflicting files. Note this will also recreate a clean local instance of Confluence from scratch, removing any pages/calenders etc. created on previous instances. The resultant file at target/ska-low-confluence-calendar-macro-X.X.X.obr can now be installed onto an external Confluence via the Manage Apps page. This file contains all dependencies and components necessary for the macro to be installed and run.

Ensure that if you are deploying onto an external Confluence with previous versions of the app, you have incremented the version number in the [pom.xml](pom.xml), otherwise it may not recognise any changes.

## Further Development

Below is a diagram of the code architecture.

![Code Architecture](images/architecture.svg)

This tool is designed specifically for the SKA-Low telescope however could be adapted to be used in other contexts. The SKA-Low specifics that would need changing include:

- Timezone is locked to Australia/Perth
- Station and Project Phase naming conventions
- Station data .json file

## Support

jesse.cooper@skao.int
lucy.grigoroff@skao.int