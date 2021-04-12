# DV360 Triggerator 
Decision engine for automated managing DV360 campaigns using signals from external data feeds.

**This is not an officially supported Google product.**

## Description
The idea behind this project is automating management of campaigns in DV360 using data from external sources that we call data feeds (or just feeds). DV360 doesn't allow to change programmatically all settings of campaigns through API, such as bids and frequencies. That's because this project took the approach of generating up front all combinations of Insertion Orders/Line Items/etc as a SDF (Structured Data Files) and leave it to the user to import into DV360. Later during run-time the execution engine takes a campaign created from generated SDF and enables/disables particular campaign's objects for each row from feed(s).  
To decide which IOs/LIs we should enable or disable for each feed row there are rules (previously in v1 they were called tiers).  
So in the end after SDF is generated and imported into DV360 we have a total number of combinations of IOs and LIs equal to total number of combinations of feed's rows and rules. 

## Deployment

TODO