package com.skao.confluence.plugins.macro.rest;

import com.atlassian.confluence.pages.Page;
import com.atlassian.confluence.pages.PageManager;
import com.atlassian.sal.api.transaction.TransactionTemplate;

import javax.inject.Inject;
import javax.ws.rs.*;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;

@Path("/calendar")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class CalendarSaveResource {

    private final PageManager pageManager;
    private final TransactionTemplate transactionTemplate;

    @Inject
    public CalendarSaveResource(PageManager pageManager,
                                TransactionTemplate transactionTemplate) {
        this.pageManager = pageManager;
        this.transactionTemplate = transactionTemplate;
    }

    @POST
    @Path("/save")
    public Response save(CalendarUpdateRequest request) {

        try {
            transactionTemplate.execute(() -> {

                try {
                    Page page = pageManager.getPage(request.getPageId());
                    String storage = page.getBodyAsString();

                    String updatedStorage = CalendarStorageUpdater.replaceCalendarEvents(
                            storage,
                            request.getEvents()
                    );

                    page.setBodyAsString(updatedStorage);
                    pageManager.saveContentEntity(page, null);

                } catch (Exception e) {
                    throw new RuntimeException(e);   // <-- key line
                }

                return null;
            });

            return Response.ok().build();

        } catch (Exception e) {
            e.printStackTrace();
            return Response.serverError()
                    .entity("Failed to update calendar: " + e.getMessage())
                    .build();
        }
    }

}
