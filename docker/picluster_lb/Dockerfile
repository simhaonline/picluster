FROM alpine
USER root
ENV TERM xterm
RUN apk update;apk add --no-cache nginx nginx-mod-stream

#nginx config
ADD nginx.conf /etc/nginx/
RUN rm -rf /etc/nginx/conf.d/*

#ENV Variables
ENV TERM xterm

CMD rm -rf /etc/nginx/conf.d/*;nginx

